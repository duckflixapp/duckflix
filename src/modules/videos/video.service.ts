import type { VideoDTO, VideoMinDTO, VideoResolved, VideoVersionDTO } from '@duckflix/shared';
import { db, type Transaction } from '@shared/configs/db';
import { type Video } from '@shared/schema';
import { movies, moviesToGenres } from '@shared/schema/movie.schema';
import { videos } from '@shared/schema/video.schema';
import type { MovieMetadata, VideoMetadata } from '@shared/services/metadata/metadata.service';
import { VideoNotCreatedError, VideoNotFoundError } from './video.errors';
import { toVideoDTO, toVideoMinDTO } from '@shared/mappers/video.mapper';
import { getGenreIds } from '@modules/movies/services/genres.service';
import { eq } from 'drizzle-orm';
import { AppError } from '@shared/errors';
import { env } from '@core/env';
import { taskRegistry } from '@utils/taskRegistry';
import { taskHandler } from '@utils/taskHandler';
import path from 'node:path';
import fs from 'node:fs/promises';
import { paths } from '@shared/configs/path.config';

type UploadHandler<T extends VideoMetadata> = (tx: Transaction, video: Video, data: T) => Promise<void>;

const movieUploadHandler: UploadHandler<MovieMetadata> = async (tx, video, data) => {
    const [movie] = await tx
        .insert(movies)
        .values({
            videoId: video.id,
            title: data.title,
            overview: data.overview,
            bannerUrl: data.bannerUrl,
            posterUrl: data.posterUrl,
            rating: data.rating?.toString() ?? null,
            releaseYear: data.releaseYear,
        })
        .returning();

    if (!movie) throw new VideoNotCreatedError();

    const genreIds = await getGenreIds(data.genres);
    if (genreIds.length > 0) {
        await tx.insert(moviesToGenres).values(genreIds.map((genreId) => ({ movieId: movie.id, genreId })));
    }
};

const uploadHandlers: {
    [K in VideoMetadata['type']]: UploadHandler<Extract<VideoMetadata, { type: K }>>;
} = {
    movie: movieUploadHandler,
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

        const handler = uploadHandlers[metadata.type] as UploadHandler<typeof metadata>;
        await handler(tx, dbVideo, metadata);

        return dbVideo;
    });

    return toVideoMinDTO(video);
};

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

export const resolveVideo = async (videoId: string): Promise<VideoResolved> => {
    const video = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
        columns: { id: true, type: true },
        with: {
            movie: { columns: { id: true, title: true } },
        },
    });

    if (!video) throw new VideoNotFoundError();

    if (video.type == 'movie') {
        if (!video.movie) throw new AppError('Movie record missing for video', { statusCode: 500 });
        return { type: video.type, id: video.movie.id, name: video.movie.title };
    }

    throw new AppError('Content not found', { statusCode: 404 });
};
