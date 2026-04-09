import type { VideoDTO, VideoMinDTO, VideoResolved, VideoVersionDTO } from '@duckflixapp/shared';
import { db, type Transaction } from '@shared/configs/db';
import { series, seriesEpisodes, seriesGenres, seriesSeasons, seriesToGenres, type SeriesStatus, type Video } from '@schema/index';
import { movieGenres, movies, moviesToGenres } from '@shared/schema/movie.schema';
import { videos, watchHistory } from '@shared/schema/video.schema';
import type { EpisodeMetadata, MovieMetadata, VideoMetadata } from '@shared/services/metadata/metadata.types';
import { VideoNotCreatedError, VideoNotFoundError } from '../video.errors';
import { toVideoDTO, toVideoMinDTO, toWatchHistoryDTO } from '@shared/mappers/video.mapper';
import { and, eq, inArray } from 'drizzle-orm';
import { AppError } from '@shared/errors';
import { env } from '@core/env';
import { taskRegistry } from '@utils/taskRegistry';
import { taskHandler } from '@utils/taskHandler';
import path from 'node:path';
import fs from 'node:fs/promises';
import { paths } from '@shared/configs/path.config';
import { tmdbClient } from '@shared/lib/tmdb';
import { isDuplicateKey } from '@shared/db.errors';

// ----- Video Upload -----
type UploadHandler<T extends VideoMetadata> = (tx: Transaction, video: Video, data: T) => Promise<void>;

const movieUploadHandler: UploadHandler<MovieMetadata> = async (tx, video, data) => {
    try {
        const [movie] = await tx
            .insert(movies)
            .values({
                videoId: video.id,
                title: data.title,
                overview: data.overview,
                bannerUrl: data.bannerUrl,
                posterUrl: data.posterUrl,
                rating: data.rating?.toString() ?? null,
                tmdbId: data.tmdbId,
                releaseYear: data.releaseYear,
            })
            .returning({ id: movies.id });

        if (!movie) throw new VideoNotCreatedError();

        if (data.genres.length > 0) {
            const movieGenresRaw = await tx
                .select({ id: movieGenres.id })
                .from(movieGenres)
                .where(inArray(movieGenres.name, data.genres))
                .orderBy(movieGenres.name);

            const genreIds = movieGenresRaw.map(({ id }) => id);
            if (genreIds.length > 0) await tx.insert(moviesToGenres).values(genreIds.map((genreId) => ({ movieId: movie.id, genreId })));
        }
    } catch (e) {
        if (isDuplicateKey(e)) throw new AppError('Movie already exists', { statusCode: 409 });
        throw e;
    }
};

const episodeUploadHandler: UploadHandler<EpisodeMetadata> = async (tx, video, data) => {
    const existingSeries = await tx.query.series.findFirst({
        where: eq(series.tmdbId, data.tmdbShowId),
        with: {
            seasons: true,
        },
    });

    let seriesId = existingSeries?.id;
    if (!seriesId) {
        const raw = await tmdbClient.getSeriesDetails(data.tmdbShowId);

        const allowedStatus: SeriesStatus[] = ['returning', 'ended', 'canceled', 'in_production'] as const;
        const status = allowedStatus.find((s) => s === raw.status) ?? null;

        const value = {
            title: raw.name,
            overview: raw.overview,
            posterUrl: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : undefined,
            bannerUrl: raw.backdrop_path ? `https://image.tmdb.org/t/p/original${raw.backdrop_path}` : undefined,
            rating: raw.vote_average.toString(),
            firstAirDate: raw.first_air_date,
            lastAirDate: raw.last_air_date,
            status,
            tmdbId: raw.id,
        };

        const [inserted] = await tx
            .insert(series)
            .values(value)
            .onConflictDoUpdate({ target: series.tmdbId, set: value })
            .returning({ id: series.id });

        seriesId = inserted!.id;

        const genreNames = raw.genres.map((g) => g.name.toLowerCase());
        if (genreNames.length > 0) {
            const seriesGenresRaw = await tx
                .select({ id: seriesGenres.id })
                .from(seriesGenres)
                .where(inArray(seriesGenres.name, genreNames));

            const genreIds = seriesGenresRaw.map(({ id }) => id);
            if (genreIds.length > 0) await tx.insert(seriesToGenres).values(genreIds.map((genreId) => ({ seriesId: seriesId!, genreId })));
        }
    }

    let seasonId = existingSeries?.seasons.find((s) => s.seasonNumber === data.seasonNumber)?.id;
    if (!seasonId) {
        const raw = await tmdbClient.getSeasonDetails(data.tmdbShowId, data.seasonNumber);

        const value = {
            name: raw.name,
            overview: raw.overview,
            posterUrl: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : undefined,
            airDate: raw.air_date,
            seriesId,
            seasonNumber: raw.season_number,
        };

        const [inserted] = await tx
            .insert(seriesSeasons)
            .values(value)
            .onConflictDoUpdate({
                target: [seriesSeasons.seriesId, seriesSeasons.seasonNumber],
                set: value,
            })
            .returning({ id: seriesSeasons.id });

        seasonId = inserted!.id;
    }

    try {
        await tx.insert(seriesEpisodes).values({
            seasonId,
            videoId: video.id,
            episodeNumber: data.episodeNumber,
            name: data.name,
            overview: data.overview,
            airDate: data.airDate?.toDateString() ?? null,
            runtime: data.runtime,
            stillUrl: data.stillUrl,
            rating: data.rating?.toString() ?? null,
            tmdbId: data.tmdbId,
        });
    } catch (e) {
        if (isDuplicateKey(e)) throw new AppError('Episode already exists', { statusCode: 409 });
        throw e;
    }
};

const uploadHandlerFactory = (metadata: VideoMetadata) => {
    if (metadata.type === 'movie') return (tx: Transaction, video: Video) => movieUploadHandler(tx, video, metadata);
    if (metadata.type === 'episode') return (tx: Transaction, video: Video) => episodeUploadHandler(tx, video, metadata);
    throw new AppError('Upload type not supported', { statusCode: 501 });
};

export const initiateUpload = async (
    metadata: VideoMetadata,
    data: { userId: string; status: 'downloading' | 'processing' }
): Promise<VideoMinDTO> => {
    const video = await db.transaction(async (tx) => {
        const [dbVideo] = await tx
            .insert(videos)
            .values({
                duration: null,
                status: data.status,
                uploaderId: data.userId,
                type: metadata.type,
            })
            .returning();

        if (!dbVideo) throw new VideoNotCreatedError();

        const handler = uploadHandlerFactory(metadata);
        await handler(tx, dbVideo);

        return dbVideo;
    });

    return toVideoMinDTO(video);
};
// ----- End Video Upload -----

export const getVideoById = async (videoId: string): Promise<VideoDTO> => {
    const video = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
        with: {
            versions: true,
            subtitles: true,
            uploader: {
                columns: {
                    id: true,
                    name: true,
                    role: true,
                    system: true,
                },
            },
        },
    });

    if (!video) throw new VideoNotFoundError();

    const dto = toVideoDTO(video);

    const original = video.versions.find((v) => v.isOriginal);
    if (original && video.duration) {
        const livePresets = [2160, 1440, 1080, 720, 480];
        const existingHeights = video.versions.filter((v) => v.status === 'ready').map((v) => v.height);

        const liveVersions: VideoVersionDTO[] = livePresets
            .filter((h) => h <= original.height && !existingHeights.includes(h))
            .map((h) => ({
                id: `live-${h}`,
                height: h,
                width: Math.round(((original.width ?? 1920) * h) / original.height / 2) * 2,
                mimeType: 'application/x-mpegURL',
                streamUrl: `${env.BASE_URL}/media/live/${videoId}/${h}/index.m3u8`,
                status: 'ready',
                isOriginal: false,
                fileSize: null,
            }));

        dto.generatedVersions = liveVersions;
    }

    return dto;
};

export const deleteVideoById = async (videoId: string) => {
    const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId), with: { versions: true } });

    if (!video) throw new VideoNotFoundError();

    if (video.status === 'processing') throw new AppError('Wait until video is processed', { statusCode: 403 });
    if (video.status === 'downloading') throw new AppError('Wait until video is downloaded', { statusCode: 403 });

    for (const version of video.versions) {
        if (version.status === 'processing') {
            await taskRegistry.kill(version.id).catch(() => {});
        } else if (version.status === 'waiting') {
            taskHandler.cancel(version.id);
        }
    }

    const videoDir = path.resolve(paths.storage, 'videos', video.id);
    await fs.rm(videoDir, { recursive: true, force: true }).catch(() => {});
    await db.delete(videos).where(eq(videos.id, video.id));
};

export const getVideoProgressById = async (data: { videoId: string; userId: string }) => {
    const [video] = await db
        .select({ id: videos.id, history: watchHistory })
        .from(videos)
        .where(eq(videos.id, data.videoId))
        .leftJoin(watchHistory, and(eq(watchHistory.videoId, data.videoId), eq(watchHistory.userId, data.userId)));

    if (!video) throw new VideoNotFoundError();

    if (!video.history) return null;

    return toWatchHistoryDTO(video.history);
};

export const saveVideoProgressById = async (data: { videoId: string; userId: string; positionSec: number }) => {
    const [video] = await db.select({ id: videos.id, duration: videos.duration }).from(videos).where(eq(videos.id, data.videoId));
    if (!video) throw new VideoNotFoundError();

    // in future implement ffmpeg logic to find intro and outro
    const isFinished = video.duration ? data.positionSec > video.duration * 0.95 : false;

    const [result] = await db
        .insert(watchHistory)
        .values({
            userId: data.userId,
            videoId: data.videoId,
            lastPosition: data.positionSec,
            isFinished,
            updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
            target: [watchHistory.userId, watchHistory.videoId],
            set: {
                lastPosition: data.positionSec,
                isFinished,
                updatedAt: new Date().toISOString(),
            },
        })
        .returning();

    if (!result) throw new AppError('Failed to save progress', { statusCode: 500 });

    return toWatchHistoryDTO(result);
};

export const resolveVideo = async (videoId: string): Promise<VideoResolved> => {
    const video = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
        columns: { id: true, type: true },
        with: {
            movie: { columns: { id: true, title: true } },
            episode: { columns: { id: true, name: true } },
        },
    });

    if (!video) throw new VideoNotFoundError();

    if (video.type == 'movie') {
        if (!video.movie) throw new AppError('Movie record missing for video', { statusCode: 500 });
        return { type: video.type, id: video.movie.id, name: video.movie.title };
    }

    if (video.type == 'episode') {
        if (!video.episode) throw new AppError('Episode record missing for video', { statusCode: 500 });
        return { type: video.type, id: video.episode.id, name: video.episode.name };
    }

    throw new AppError('Content not found', { statusCode: 404 });
};
