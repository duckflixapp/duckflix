import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { videos, videoVersions } from '@schema/video.schema';
import { AppError } from '@shared/errors';
import path from 'node:path';
import { paths } from '@shared/configs/path.config';
import { startProcessing } from '../video.processor';
import fs from 'node:fs/promises';
import { toVideoVersionDTO } from '@shared/mappers/video.mapper';
import { taskHandler } from '@utils/taskHandler';
import { taskRegistry } from '@utils/taskRegistry';
import { OriginalVideoVersionNotFoundError, VideoNotFoundError } from '../video.errors';

export const getAllVideoVersions = async (videoId: string) => {
    const results = await db.transaction(async (tx) => {
        const [video] = await tx
            .select({ exists: sql<number>`1` })
            .from(videos)
            .where(eq(videos.id, videoId));
        if (!video) throw new AppError('Video not found', { statusCode: 404 });

        return tx.query.videoVersions.findMany({
            where: eq(videoVersions.videoId, videoId),
        });
    });

    return results.map(toVideoVersionDTO);
};

export const addVideoVersion = async (videoId: string, height: number) => {
    const result = await db.query.videos.findFirst({
        where: eq(videos.id, videoId),
        with: {
            versions: {
                where: and(eq(videoVersions.isOriginal, true), eq(videoVersions.status, 'ready')),
            },
        },
    });

    if (!result) throw new VideoNotFoundError();

    const original = result.versions.find((v) => v.isOriginal);
    if (!original) throw new OriginalVideoVersionNotFoundError();

    if (height > original.height) throw new AppError('Height exceeds original resolution', { statusCode: 400 });

    const existing = await db.query.videoVersions.findFirst({
        where: and(
            eq(videoVersions.videoId, videoId),
            eq(videoVersions.height, height),
            eq(videoVersions.mimeType, 'application/x-mpegURL'),
            inArray(videoVersions.status, ['ready', 'processing', 'waiting'])
        ),
    });
    if (existing) throw new AppError('Version already exists', { statusCode: 409 });

    const originalPath = path.resolve(paths.storage, original.storageKey);

    await startProcessing(videoId, [height], paths.storage, originalPath);
};

export const deleteVideoVersion = async (videoId: string, versionId: string) => {
    const version = await db.query.videoVersions.findFirst({
        where: and(eq(videoVersions.id, versionId), eq(videoVersions.videoId, videoId)),
    });

    if (!version) throw new AppError('Version not found', { statusCode: 404 });
    if (version.isOriginal) throw new AppError('Cannot delete original version', { statusCode: 400 });

    let sucess = true;
    if (version.status === 'waiting') {
        // remove from queue
        sucess = taskHandler.cancel(versionId);
    }
    if (version.status === 'processing') {
        // cancel task
        sucess = await taskRegistry.kill(versionId);
    }

    const dirPath = path.dirname(path.resolve(paths.storage, version.storageKey));
    await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
    await db.delete(videoVersions).where(eq(videoVersions.id, versionId));
    return sucess;
};
