import path from 'node:path';
import fs from 'node:fs/promises';
import { and, asc, count, desc, eq, exists, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../../../shared/configs/db';
import { genres, libraries, libraryItems, movies, moviesToGenres, movieVersions } from '../../../shared/schema';
import { InvalidVideoFileError, MovieNotCreatedError, MovieNotFoundError, TorrentDownloadError } from '../movies.errors';
import { randomUUID } from 'node:crypto';
import { ffprobe } from '../../../shared/video';
import { createMovieStorageKey, startProcessing } from '../movies.processor';
import type { DownloadProgress, MovieDetailedDTO, MovieDTO, MovieVersionDTO, PaginatedResponse } from '@duckflix/shared';
import { toMovieDetailedDTO, toMovieDTO } from '../../../shared/mappers/movies.mapper';
import { getMimeTypeFromFormat } from '../../../shared/utils/ffmpeg';
import { paths } from '../../../shared/configs/path.config';
import { AppError } from '../../../shared/errors';
import { TorrentClient, validateTorrentFileSize } from '../../../shared/utils/torrent';
import type { VideoMetadata } from './metadata.service';
import { RqbitClient } from '../../../shared/lib/rqbit';
import { emitMovieProgress } from '../movies.handler';
import { notifyJobStatus } from '../../../shared/services/notification.service';
import { computeHash, downloadSubtitles } from './subs.service';
import { env } from '../../../env';
import { systemSettings } from '../../../shared/services/system.service';
import { logger } from '../../../shared/configs/logger';

const rqbitClient = new RqbitClient({ baseUrl: env.RQBIT_URL! });
const torrentClient = new TorrentClient({ rqbit: rqbitClient });

export const initiateUpload = async (
    data: {
        userId: string;
        status: 'downloading' | 'processing';
    } & VideoMetadata
): Promise<MovieDTO> => {
    const [dbMovie] = await db
        .insert(movies)
        .values({
            title: data.title,
            description: data.overview,
            bannerUrl: data.bannerUrl,
            posterUrl: data.posterUrl,
            rating: data.rating?.toString() ?? null,
            releaseYear: data.releaseYear,
            duration: null,
            status: data.status,
            uploaderId: data.userId,
        })
        .returning();
    if (!dbMovie) throw new MovieNotCreatedError();

    if (data.genreIds && data.genreIds.length > 0) {
        const values = data.genreIds.map((genreId) => ({ movieId: dbMovie.id, genreId: genreId }));
        await db
            .insert(moviesToGenres)
            .values(values)
            .catch(async (err) => {
                throw new AppError('Database insert failed for movie genres', { statusCode: 500, cause: err });
            });
    }

    const selectedGenres = data.genreIds.length > 0 ? await db.select().from(genres).where(inArray(genres.id, data.genreIds)) : [];
    return toMovieDTO({
        ...dbMovie,
        genres: selectedGenres.map((genre) => ({ genre })),
    });
};

export const processTorrentFileWorkflow = async (data: { userId: string; movieId: string; torrentPath: string; imdbId: string | null }) => {
    let torrentBuffer: Buffer;
    try {
        const valid = await validateTorrentFileSize(data.torrentPath);
        if (!valid) throw new AppError('Torrent file is too large', { statusCode: 400 });

        torrentBuffer = await fs.readFile(data.torrentPath);
    } catch (err) {
        throw err;
    } finally {
        await fs.unlink(data.torrentPath).catch(() => {});
    }

    await fs.mkdir(paths.downloads, { recursive: true });

    const torrent = await torrentClient.download(torrentBuffer).catch((e) => {
        throw new TorrentDownloadError(e);
    });

    torrent.addListener('progress', (progress) => emitMovieProgress(data.movieId, 'downloading', progress as DownloadProgress));

    torrent.addListener('error', ({ error, code }) => {
        logger.debug(
            {
                err: error,
                errorCode: code,
                movieId: data.movieId,
                context: 'torrent_client',
            },
            'Torrent download status error'
        );
    });

    try {
        logger.info({ movieId: data.movieId }, 'Torrent waiting for download...');
        await torrent.waitDownload();
        logger.info({ movieId: data.movieId }, 'Torrent download finished...');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        fs.rm(torrent.dir, { recursive: true, force: true }).catch(() => {});
        throw new TorrentDownloadError(err);
    }

    try {
        await db.update(movies).set({ status: 'processing' }).where(eq(movies.id, data.movieId));
        notifyJobStatus(data.userId, 'downloaded', `Movie downloaded`, `Movie download completed. Processing...`, data.movieId).catch(
            () => {}
        );
    } catch (e) {
        await fs.rm(torrent.dir, { recursive: true, force: true }).catch(() => {});
        torrent.destroy().catch(() => {});
        throw new AppError('Error changing video status and notifying', { cause: e });
    }

    let safePath, mainFile;
    try {
        mainFile = torrent.files.reduce((p, c) => (p.length > c.length ? p : c));
        const downloadedPath = path.join(torrent.dir, mainFile.name);

        const ext = path.extname(mainFile.name);
        safePath = path.join(paths.downloads, `${data.movieId}-torrent${ext}`);
        await fs.rename(downloadedPath, safePath);
    } catch (e) {
        throw new AppError('Video could not be copied after downloading', { cause: e });
    } finally {
        await fs.rm(torrent.dir, { recursive: true, force: true }).catch(() => {});
        torrent.destroy().catch(() => {}); // ignore error
    }

    await processMovieWorkflow({
        userId: data.userId,
        movieId: data.movieId,
        tempPath: safePath,
        originalName: mainFile.name,
        fileSize: mainFile.length,
        imdbId: data.imdbId,
    });
};

export const processMovieWorkflow = async (data: {
    userId: string;
    movieId: string;
    tempPath: string;
    originalName: string;
    fileSize: number;
    imdbId: string | null;
}): Promise<void> => {
    let metadata, videoStream;
    try {
        metadata = await ffprobe(data.tempPath).catch(async () => {
            throw new InvalidVideoFileError();
        });

        const formatName = metadata.format.format_name;
        if (formatName?.includes('image') || formatName === 'png' || formatName === 'mjpeg') throw new InvalidVideoFileError();

        videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        if (!videoStream) throw new InvalidVideoFileError();

        const duration = Number(metadata.format.duration) || 0;
        if (duration < 2) throw new InvalidVideoFileError();
    } catch (err) {
        await fs.unlink(data.tempPath).catch(() => {});
        throw err;
    }

    const originalWidth = Number(videoStream.width) || 0;
    const originalHeight = Number(videoStream.height) || 0;
    const duration = Math.round(Number(metadata.format.duration) || 0);
    const mimeType = getMimeTypeFromFormat(metadata.format.format_name);

    // create path for movie version
    const fileExt = path.extname(data.originalName);
    const originalId = randomUUID();
    const storageKey = createMovieStorageKey(data.movieId, originalId, 'index' + fileExt);
    const finalPath = path.join(paths.storage, storageKey);

    try {
        await fs.mkdir(path.dirname(finalPath), { recursive: true });
        await fs.rename(data.tempPath, finalPath);

        // add version and set status to ready on movie
        await db.transaction(async (tx) => {
            await tx.insert(movieVersions).values({
                id: originalId,
                movieId: data.movieId,
                width: originalWidth,
                height: originalHeight,
                isOriginal: true,
                storageKey: storageKey,
                fileSize: data.fileSize,
                mimeType,
                status: 'ready',
            });
            await tx.update(movies).set({ duration, status: 'ready' }).where(eq(movies.id, data.movieId));
        });
        notifyJobStatus(data.userId, 'completed', `Upload completed`, `Movie uploaded successfully`, data.movieId).catch(() => {});
    } catch (e) {
        await fs.unlink(finalPath).catch(() => {});
        throw new AppError('Video could not be saved in database', { cause: e });
    }

    // Subtitles
    if (data.imdbId) {
        const movieHash = await computeHash(finalPath);
        downloadSubtitles({ movieId: data.movieId, imdbId: data.imdbId, movieHash }).catch((err) => {
            logger.error(
                {
                    err,
                    movieId: data.movieId,
                    imdbId: data.imdbId,
                    context: 'subtitles_service',
                },
                'Failed to download subtitles in background'
            );
        });
    }

    // Resolutions
    const tasksToRun = new Set<number>();

    const sysSettings = await systemSettings.get();
    const processingPreference = sysSettings.features.autoTranscoding;
    if (processingPreference === 'compatibility' || processingPreference === 'smart') {
        if (mimeType != 'video/mp4') {
            // process original resolution if not mp4
            tasksToRun.add(originalHeight);

            const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
            const codecName = videoStream?.codec_name;
            if (codecName === 'h265' || codecName === 'hevc') {
                if (originalHeight > 1080) tasksToRun.add(1080);
                else if (originalHeight > 720) tasksToRun.add(720);
            }
        }

        if (processingPreference === 'smart') {
            // process tasks for lower resolutions -> enable (auto) only on strong cpus
            if (originalHeight > 1080) tasksToRun.add(1080);
            else if (originalHeight > 720) tasksToRun.add(720);
        }
    }

    if (tasksToRun.size > 0) startProcessing(data.movieId, Array.from(tasksToRun), paths.storage, finalPath);
};

const getOrderBy = (orderBy: string | null) => {
    switch (orderBy) {
        case 'oldest':
            return [asc(movies.createdAt)];
        case 'rating':
            return [desc(sql`cast(${movies.rating} as decimal)`), desc(movies.createdAt)];
        case 'title':
            return [asc(movies.title)];
        case 'newest':
        default:
            return [desc(movies.createdAt)];
    }
};

export const getMovies = async (options: {
    page: number;
    limit: number;
    search?: string;
    orderBy?: string;
    genreId?: string;
}): Promise<PaginatedResponse<MovieDTO>> => {
    const offset = (options.page - 1) * options.limit;

    const searchFilter = options.search ? ilike(movies.title, `%${options.search}%`) : null;
    const readyFilter = eq(movies.status, 'ready');
    const genreFilter = options.genreId
        ? exists(
              db
                  .select()
                  .from(moviesToGenres)
                  .where(and(eq(moviesToGenres.movieId, movies.id), eq(moviesToGenres.genreId, options.genreId)))
          )
        : null;

    const conditions = [searchFilter, readyFilter, genreFilter];
    const filters = and(...conditions.filter((cond) => cond != null));

    const orderBy = getOrderBy(options.orderBy ?? null);

    const [totalResult, results] = await Promise.all([
        db.select({ value: count() }).from(movies).where(filters),
        db.query.movies.findMany({
            where: filters,
            limit: options.limit,
            offset: offset,
            orderBy,
            with: {
                genres: {
                    with: {
                        genre: true,
                    },
                },
            },
        }),
    ]);

    if (!totalResult[0]) throw new Error('DB Count() failed');

    const totalItems = Number(totalResult[0].value);

    return {
        data: results.map(toMovieDTO),
        meta: {
            totalItems,
            itemCount: results.length,
            itemsPerPage: options.limit,
            totalPages: Math.ceil(totalItems / options.limit),
            currentPage: options.page,
        },
    };
};

export const getMovieById = async (id: string, options: { userId: string | null } = { userId: null }): Promise<MovieDetailedDTO | null> => {
    const result = await db.query.movies.findFirst({
        where: eq(movies.id, id),
        with: {
            genres: {
                with: {
                    genre: true,
                },
            },
            versions: true,
            subtitles: true,
            uploader: {
                columns: {
                    id: true,
                    name: true,
                    role: true,
                },
            },
        },
    });

    if (!result) throw new MovieNotFoundError();

    let inLibrary: boolean | null = null;
    if (options.userId) {
        const [libraryCount] = await db
            .select({ value: count() })
            .from(libraries)
            .leftJoin(libraryItems, eq(libraries.id, libraryItems.libraryId))
            .where(and(eq(libraries.type, 'watchlist'), eq(libraries.userId, options.userId), eq(libraryItems.movieId, id)));

        inLibrary = !!libraryCount?.value && libraryCount?.value > 0;
    }

    const dto = toMovieDetailedDTO(result, inLibrary);

    const original = result.versions.find((v) => v.isOriginal);
    if (original && result.duration) {
        const livePresets = [2160, 1440, 1080, 720, 480];
        const existingHeights = result.versions.map((v) => v.height);

        const liveVersions: MovieVersionDTO[] = livePresets
            .filter((h) => h <= original.height && !existingHeights.includes(h))
            .map((h) => ({
                id: `live-${h}`,
                height: h,
                width: Math.round(((original.width ?? 1920) * h) / original.height / 2) * 2,
                mimeType: 'application/x-mpegURL',
                streamUrl: `${env.BASE_URL}/media/live/${id}/${h}/index.m3u8`,
                status: 'ready',
                isOriginal: false,
                fileSize: null,
            }));

        dto.generatedVersions = liveVersions;
    }

    return dto;
};

export const recordWatchStart = async (_movieId: string, _userId: string) => {};
