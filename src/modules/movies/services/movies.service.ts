import path from 'node:path';
import fs from 'node:fs/promises';
import { and, count, desc, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '../../../shared/db';
import { genres, movies, moviesToGenres, movieVersions } from '../../../shared/schema';
import { InvalidVideoFileError, MovieNotCreatedError, MovieNotFoundError, TorrentDownloadError } from '../movies.errors';
import { randomUUID } from 'node:crypto';
import { ffprobe } from '../../../shared/utils/videoProcessor';
import { createMovieStorageKey, startProcessing } from '../movies.processor';
import type { MovieDetailedDTO, MovieDTO, PaginatedResponse } from '@duckflix/shared';
import { toMovieDetailedDTO, toMovieDTO } from '../../../shared/mappers/movies.mapper';
import { getMimeTypeFromFormat } from '../../../shared/utils/ffmpeg';
import { paths } from '../../../shared/configs/path.config';
import { AppError } from '../../../shared/errors';
import { downloadTorrent, formatSpeed, validateTorrentSize } from '../../../shared/utils/torrent';
import type { VideoMetadata } from './metadata.service';

export const initiateUpload = async (
    data: {
        userId: string;
    } & VideoMetadata
): Promise<MovieDTO> => {
    const [dbMovie] = await db
        .insert(movies)
        .values({
            title: data.title,
            description: data.overview,
            bannerUrl: data.bannerUrl,
            posterUrl: data.posterUrl,
            rating: null,
            releaseYear: data.releaseYear,
            duration: null,
            status: 'processing',
            userId: data.userId,
        })
        .returning();
    if (!dbMovie) throw new MovieNotCreatedError();

    if (data.genreIds && data.genreIds.length > 0) {
        const values = data.genreIds.map((genreId) => ({ movieId: dbMovie.id, genreId: genreId }));
        await db.insert(moviesToGenres).values(values);
    }

    const selectedGenres = data.genreIds.length > 0 ? await db.select().from(genres).where(inArray(genres.id, data.genreIds)) : [];
    return toMovieDTO({
        ...dbMovie,
        genres: selectedGenres.map((genre) => ({ genre })),
    });
};

export const processTorrentFileWorkflow = async (data: { movieId: string; torrentPath: string }) => {
    let torrentBuffer: Buffer;
    try {
        const valid = await validateTorrentSize(data.torrentPath);
        if (!valid) throw new AppError('Torrent file is too large', { statusCode: 400 });

        torrentBuffer = await fs.readFile(data.torrentPath);
    } catch (err) {
        throw err;
    } finally {
        await fs.unlink(data.torrentPath).catch(() => {});
    }

    const sessionFolder = path.join(paths.downloads, data.movieId);
    await fs.mkdir(sessionFolder, { recursive: true });

    const torrent = await downloadTorrent(torrentBuffer, sessionFolder, (progress, speed) => {
        const formattedSpeed = formatSpeed(speed);
        const formattedProgress = progress.toFixed(2);
        process.stdout.write(`\rDownload progress: ${formattedProgress}% @ ${formattedSpeed}\x1b[K`);
    }).catch((e) => {
        fs.rm(sessionFolder, { recursive: true, force: true }).catch(() => {}); // cleanup
        throw new TorrentDownloadError(e);
    });

    let safePath, mainFile;
    try {
        mainFile = torrent.files.reduce((p, c) => (p.length > c.length ? p : c));
        const downloadedPath = path.join(torrent.path, mainFile.path);

        const ext = path.extname(mainFile.name);
        safePath = path.join(paths.downloads, `${data.movieId}-torrent${ext}`);
        await fs.rename(downloadedPath, safePath);
    } catch (e) {
        throw new AppError('Video could not be copied after downloading', { cause: e });
    } finally {
        torrent.destroy();
        await fs.rm(sessionFolder, { recursive: true, force: true }).catch(() => {});
    }

    await processMovieWorkflow({
        movieId: data.movieId,
        tempPath: safePath,
        originalName: mainFile.name,
        fileSize: mainFile.length,
    });
};

export const processMovieWorkflow = async (data: {
    movieId: string;
    tempPath: string;
    originalName: string;
    fileSize: number;
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
    const storageKey = createMovieStorageKey(data.movieId, originalId, fileExt);
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
    } catch (e) {
        await fs.unlink(finalPath).catch(() => {});
        throw new AppError('Video could not be saved in database', { cause: e });
    }

    const tasksToRun = new Set<number>();
    // process original resolution if not mp4
    if (mimeType != 'video/mp4') {
        // try to keep standardized resolutions
        if (originalHeight >= 2160) tasksToRun.add(2160);
        else if (originalHeight >= 1440) tasksToRun.add(1440);
        else if (originalHeight >= 1080) tasksToRun.add(1080);
        else if (originalHeight >= 720) tasksToRun.add(720);
        else tasksToRun.add(originalHeight);
    }

    // process tasks for lower resolutions
    if (originalHeight > 1080) tasksToRun.add(1080);
    else if (originalHeight > 720) tasksToRun.add(720);

    if (tasksToRun.size > 0) startProcessing(data.movieId, Array.from(tasksToRun), paths.storage, finalPath);
};

export const getMovies = async (page: number, limit: number, search?: string): Promise<PaginatedResponse<MovieDTO>> => {
    const offset = (page - 1) * limit;

    const searchFilter = search ? ilike(movies.title, `%${search}%`) : null;
    const readyFilter = eq(movies.status, 'ready');

    const conditions = [searchFilter, readyFilter];
    const filters = and(...conditions.filter((cond) => cond != null));

    const [totalResult, results] = await Promise.all([
        db.select({ value: count() }).from(movies).where(filters),
        db.query.movies.findMany({
            where: filters,
            limit: limit,
            offset: offset,
            orderBy: [desc(movies.createdAt)],
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
            itemsPerPage: limit,
            totalPages: Math.ceil(totalItems / limit),
            currentPage: page,
        },
    };
};

export const getMovieById = async (id: string): Promise<MovieDetailedDTO | null> => {
    const result = await db.query.movies.findFirst({
        where: eq(movies.id, id),
        with: {
            genres: {
                with: {
                    genre: true,
                },
            },
            versions: true,
            user: {
                columns: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    if (!result) throw new MovieNotFoundError();

    return toMovieDetailedDTO(result);
};
