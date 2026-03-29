import path from 'node:path';
import fs from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { videos, videoVersions } from '@shared/schema/video.schema';
import { InvalidVideoFileError } from '../video.errors';
import { randomUUID } from 'node:crypto';
import { ffprobe } from '@shared/services/video';
import { createVideoStorageKey, startProcessing } from '../video.processor';
import { getMimeTypeFromFormat } from '@utils/ffmpeg';
import { paths } from '@shared/configs/path.config';
import { AppError } from '@shared/errors';
import { notifyJobStatus } from '@shared/services/notifications/notification.helper';
import { computeHash } from '../services/subs.service';
import { systemSettings } from '@shared/services/system.service';
import { logger } from '@shared/configs/logger';
import { downloadSubtitlesWorkflow, extractSubtitlesWorkflow } from './subtitles.workflow';
import { getStorageStatistics } from '@shared/services/storage.service';

export const processVideoWorkflow = async (data: {
    userId: string;
    videoId: string;
    tempPath: string;
    originalName: string;
    fileSize: number;
    type: 'movie';
    imdbId: string | null;
}): Promise<void> => {
    let metadata, fileSize, videoStream;
    try {
        metadata = await ffprobe(data.tempPath).catch(async () => {
            throw new InvalidVideoFileError();
        });
        fileSize = data.fileSize || Number(metadata.format.size) || 0;

        const formatName = metadata.format.format_name;
        if (formatName?.includes('image') || formatName === 'png' || formatName === 'mjpeg') throw new InvalidVideoFileError();

        videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        if (!videoStream) throw new InvalidVideoFileError();

        const duration = Number(metadata.format.duration) || 0;
        if (duration < 2) throw new InvalidVideoFileError();

        const stats = await getStorageStatistics();
        if (fileSize > 0 && fileSize > stats.availableBytes)
            throw new AppError('There is not enough space in storage', { statusCode: 507 });
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
    const storageKey = createVideoStorageKey(data.videoId, originalId, 'index' + fileExt);
    const finalPath = path.join(paths.storage, storageKey);

    try {
        await fs.mkdir(path.dirname(finalPath), { recursive: true });
        await fs.rename(data.tempPath, finalPath);
    } catch (e) {
        await fs.unlink(data.tempPath).catch(() => {});
        await fs.rm(path.join(paths.storage, 'videos', data.videoId), { recursive: true, force: true }).catch(() => {});
        throw new AppError('Video could not be moved into storage', { cause: e });
    }

    try {
        // add version and set status to ready on movie
        await db.transaction(async (tx) => {
            await tx.insert(videoVersions).values({
                id: originalId,
                videoId: data.videoId,
                width: originalWidth,
                height: originalHeight,
                isOriginal: true,
                storageKey: storageKey,
                fileSize,
                mimeType,
                status: 'ready',
            });
            await tx.update(videos).set({ duration, status: 'ready' }).where(eq(videos.id, data.videoId));
        });
        notifyJobStatus(data.userId, 'completed', `Upload completed`, `Video uploaded successfully`, data.videoId).catch(() => {});
    } catch (e) {
        await fs.unlink(finalPath).catch(() => {});
        throw new AppError('Video could not be saved in database', { cause: e });
    }

    // Subtitles
    await extractSubtitlesWorkflow({ filePath: finalPath, videoId: data.videoId, metadata });

    // - External
    if (data.imdbId) {
        const movieHash = await computeHash(finalPath);
        downloadSubtitlesWorkflow({ videoId: data.videoId, type: data.type, imdbId: data.imdbId, movieHash }).catch((err) => {
            logger.error(
                {
                    err,
                    videoId: data.videoId,
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

    if (tasksToRun.size > 0) startProcessing(data.videoId, Array.from(tasksToRun), paths.storage, finalPath);
};
