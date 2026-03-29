import path from 'node:path';
import fs from 'node:fs/promises';
import { db } from '@shared/configs/db';
import { type VideoVersion, type NewVideoVersion } from '@shared/schema';
import { videoVersions } from '@shared/schema/video.schema';
import { VideoJob, type JobType } from '@shared/services/video';
import { ffprobe } from '@shared/services/video';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { taskHandler } from '@utils/taskHandler';
import { emitVideoProgress, handleVideoTask, handleProcessingError } from './video.handler';
import { AppError } from '@shared/errors';
import { taskRegistry } from '@utils/taskRegistry';
import { VideoProcessingError } from './video.errors';

export const createVideoStorageKey = (videoId: string, versionId: string, file: string) => `videos/${videoId}/${versionId}/${file}`;

taskHandler.addListener('started', (taskId) => handleVideoTask(taskId, 'started'));
taskHandler.addListener('completed', (taskId) => handleVideoTask(taskId, 'completed'));
taskHandler.addListener('canceled', (taskId) => handleVideoTask(taskId, 'canceled'));
taskHandler.addListener('error', (taskId, e) => handleProcessingError(taskId, e, 'task')); // this should be already catched in func handleVideoProcess

const handleVideoProcess = (videoVer: VideoVersion, originalPath: string, outputPath: string) => {
    const runnable = () =>
        processTask(videoVer, originalPath, outputPath).catch((e) => {
            handleProcessingError(videoVer.id, e, 'transcode');
            return -1;
        });

    taskHandler.handle(runnable, videoVer.id);
};

export const startProcessing = async (videoId: string, tasksToRun: number[], storageFolder: string, originalPath: string) => {
    // insert tasks into db
    const tasksVersions = tasksToRun.map<NewVideoVersion>((height) => {
        const versionId = randomUUID();
        const storageKey = createVideoStorageKey(videoId, versionId, 'index.m3u8');
        return {
            id: versionId,
            videoId,
            width: null,
            height: height,
            isOriginal: false,
            storageKey,
            fileSize: 0,
            mimeType: 'application/x-mpegURL',
            status: 'waiting' as const,
        };
    });
    const waitingTasks: VideoVersion[] = await db
        .insert(videoVersions)
        .values(tasksVersions)
        .returning()
        .catch(async (err) => {
            throw new AppError('Database insert failed for video version', { cause: err });
        });

    waitingTasks.forEach((task) => handleVideoProcess(task, originalPath, path.join(storageFolder, task.storageKey)));
};

const processTask = async (task: VideoVersion, originalPath: string, outputPath: string): Promise<number> => {
    const dirPath = path.dirname(outputPath);
    try {
        await fs.mkdir(dirPath, { recursive: true });
        await db.update(videoVersions).set({ status: 'processing' }).where(eq(videoVersions.id, task.id));

        try {
            await fs.access(originalPath);
        } catch {
            throw new VideoProcessingError('Original video file not found on disk.');
        }

        const originalMeta = await ffprobe(originalPath);
        const videoStream = originalMeta.streams.find((s) => s.codec_type === 'video');

        const codecName = videoStream?.codec_name;

        // process
        const totalDuration = parseFloat(originalMeta.format.duration) || 0;

        const type: JobType = videoStream?.height === task.height && codecName === 'h264' ? 'copy' : 'transcode';
        const job = new VideoJob(originalPath, outputPath, type, {
            height: task.height,
            isHvec: codecName === 'hevc',
            priority: 1,
            totalDuration,
        });
        taskRegistry.register(task.id, job);
        job.addListener('progress', (progress) => emitVideoProgress(task.videoId, 'processing', progress, task.id));

        const successfull = await job.start();
        taskRegistry.unregister(task.id);
        job.destroy();

        if (!successfull) {
            await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
            return 1;
        }

        const files = await fs.readdir(dirPath);
        let totalSize = 0;
        for (const file of files) {
            const s = await fs.stat(path.join(dirPath, file));
            totalSize += s.size;
        }

        const finalWidth = videoStream?.width ? Math.round((videoStream.width * task.height) / (videoStream.height || 1)) : 0;

        // save resolution to database
        await db
            .update(videoVersions)
            .set({
                width: finalWidth,
                height: task.height,
                fileSize: totalSize,
                status: 'ready',
            })
            .where(eq(videoVersions.id, task.id));
        return 0;
    } catch (error) {
        await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
        throw error;
    }
};
