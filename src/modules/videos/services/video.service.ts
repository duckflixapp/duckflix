import type { VideoDTO, VideoMinDTO, VideoResolved, VideoVersionDTO } from '@duckflixapp/shared';
import type { VideoMetadata } from '@shared/services/metadata/metadata.types';
import { VideoNotFoundError } from '../video.errors';
import { toVideoDTO, toVideoMinDTO, toWatchHistoryDTO } from '@shared/mappers/video.mapper';
import { AppError } from '@shared/errors';
import { env } from '@core/env';
import { taskRegistry } from '@utils/taskRegistry';
import { taskHandler } from '@utils/taskHandler';
import path from 'node:path';
import fs from 'node:fs/promises';
import { paths } from '@shared/configs/path.config';
import { createAuditLog } from '@shared/services/audit.service';
import { drizzleVideosRepository } from '../videos.drizzle.repository';
import type { VideosRepository } from '../videos.ports';

type VideoServiceDependencies = {
    videosRepository: VideosRepository;
};

export const createVideoService = ({ videosRepository }: VideoServiceDependencies) => {
    const initiateUpload = async (
        metadata: VideoMetadata,
        data: { accountId: string; status: 'downloading' | 'processing' }
    ): Promise<VideoMinDTO> => {
        const video = await videosRepository.initiateUpload(metadata, data);
        return toVideoMinDTO(video);
    };

    const getVideoById = async (videoId: string): Promise<VideoDTO> => {
        const video = await videosRepository.findById(videoId);
        if (!video) throw new VideoNotFoundError();

        const dto = toVideoDTO(video);

        const original = video.versions.find((version) => version.isOriginal);
        if (original && video.duration) {
            const livePresets = [2160, 1440, 1080, 720, 480];
            const existingHeights = video.versions.filter((version) => version.status === 'ready').map((version) => version.height);

            const liveVersions: VideoVersionDTO[] = livePresets
                .filter((height) => height <= original.height && !existingHeights.includes(height))
                .map((height) => ({
                    id: `live-${height}`,
                    height,
                    width: Math.round(((original.width ?? 1920) * height) / original.height / 2) * 2,
                    mimeType: 'application/x-mpegURL',
                    streamUrl: `${env.BASE_URL}/media/live/${videoId}/${height}/index.m3u8`,
                    status: 'ready',
                    isOriginal: false,
                    fileSize: null,
                }));

            dto.generatedVersions = liveVersions;
        }

        return dto;
    };

    const deleteVideoById = async (videoId: string, context: { accountId: string }) => {
        const video = await videosRepository.findForDelete(videoId);
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
        await videosRepository.deleteById(video.id);
        await createAuditLog({
            actorAccountId: context.accountId,
            action: 'video.deleted',
            targetType: 'video',
            targetId: video.id,
            metadata: {
                videoType: video.type,
                movieId: video.movie?.id ?? null,
                movieTitle: video.movie?.title ?? null,
                episodeId: video.episode?.id ?? null,
                episodeName: video.episode?.name ?? null,
            },
        });
    };

    const getVideoProgressById = async (data: { videoId: string; profileId: string }) => {
        const video = await videosRepository.findProgress(data);
        if (!video) throw new VideoNotFoundError();
        if (!video.history) return null;

        return toWatchHistoryDTO(video.history);
    };

    const saveVideoProgressById = async (data: { videoId: string; profileId: string; positionSec: number }) => {
        const video = await videosRepository.findDuration(data.videoId);
        if (!video) throw new VideoNotFoundError();

        const isFinished = video.duration ? data.positionSec > video.duration * 0.95 : false;
        const existingProgress = await videosRepository.findExistingProgress(data);

        if (!!existingProgress && data.positionSec < 20 && data.positionSec <= existingProgress.lastPosition) {
            return toWatchHistoryDTO(existingProgress);
        }

        const result = await videosRepository.upsertProgress({
            ...data,
            isFinished,
            updatedAt: new Date().toISOString(),
        });

        if (!result) throw new AppError('Failed to save progress', { statusCode: 500 });

        return toWatchHistoryDTO(result);
    };

    const resolveVideo = async (videoId: string): Promise<VideoResolved> => {
        const video = await videosRepository.findForResolve(videoId);
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

    return {
        initiateUpload,
        getVideoById,
        deleteVideoById,
        getVideoProgressById,
        saveVideoProgressById,
        resolveVideo,
    };
};

export type VideoService = ReturnType<typeof createVideoService>;

export const videoService = createVideoService({
    videosRepository: drizzleVideosRepository,
});
