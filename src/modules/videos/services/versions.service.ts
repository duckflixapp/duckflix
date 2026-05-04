import { AppError } from '@shared/errors';
import path from 'node:path';
import { paths } from '@shared/configs/path.config';
import { startProcessing } from '../video.processor';
import fs from 'node:fs/promises';
import { toVideoVersionDTO } from '@shared/mappers/video.mapper';
import { taskHandler } from '@utils/taskHandler';
import { taskRegistry } from '@utils/taskRegistry';
import { OriginalVideoVersionNotFoundError, VideoNotFoundError } from '../video.errors';
import { drizzleVideoVersionsRepository } from '../videos.drizzle.repository';
import type { VideoVersionsRepository } from '../videos.ports';

type VideoVersionsServiceDependencies = {
    videoVersionsRepository: VideoVersionsRepository;
};

export const createVideoVersionsService = ({ videoVersionsRepository }: VideoVersionsServiceDependencies) => {
    const getAllVideoVersions = async (videoId: string) => {
        const results = await videoVersionsRepository.listByVideoId(videoId);
        if (!results) throw new AppError('Video not found', { statusCode: 404 });

        return results.map(toVideoVersionDTO);
    };

    const addVideoVersion = async (videoId: string, height: number) => {
        const result = await videoVersionsRepository.findVideoWithReadyOriginal(videoId);
        if (!result) throw new VideoNotFoundError();

        const original = result.versions.find((version) => version.isOriginal);
        if (!original) throw new OriginalVideoVersionNotFoundError();

        if (height > original.height) throw new AppError('Height exceeds original resolution', { statusCode: 400 });

        const existing = await videoVersionsRepository.findExistingHlsVersion({ videoId, height });
        if (existing) throw new AppError('Version already exists', { statusCode: 409 });

        const originalPath = path.resolve(paths.storage, original.storageKey);

        await startProcessing(videoId, [height], paths.storage, originalPath);
    };

    const deleteVideoVersion = async (videoId: string, versionId: string) => {
        const version = await videoVersionsRepository.findById({ videoId, versionId });

        if (!version) throw new AppError('Version not found', { statusCode: 404 });
        if (version.isOriginal) throw new AppError('Cannot delete original version', { statusCode: 400 });

        let success = true;
        if (version.status === 'waiting') {
            success = taskHandler.cancel(versionId);
        }
        if (version.status === 'processing') {
            success = await taskRegistry.kill(versionId);
        }

        const dirPath = path.dirname(path.resolve(paths.storage, version.storageKey));
        await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
        await videoVersionsRepository.deleteById(versionId);
        return success;
    };

    return {
        getAllVideoVersions,
        addVideoVersion,
        deleteVideoVersion,
    };
};

export type VideoVersionsService = ReturnType<typeof createVideoVersionsService>;

export const videoVersionsService = createVideoVersionsService({
    videoVersionsRepository: drizzleVideoVersionsRepository,
});

export const getAllVideoVersions = videoVersionsService.getAllVideoVersions;
export const addVideoVersion = videoVersionsService.addVideoVersion;
export const deleteVideoVersion = videoVersionsService.deleteVideoVersion;
