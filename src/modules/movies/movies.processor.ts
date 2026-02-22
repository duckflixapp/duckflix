import path from 'node:path';
import fs from 'node:fs/promises';
import { db } from '../../shared/configs/db';
import { movieVersions, type MovieVersion, type NewMovieVersion } from '../../shared/schema';
import { ffprobe, VideoJob, type JobType } from '../../shared/utils/videoProcessor';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { VideoProcessingError } from './movies.errors';
import { taskHandler } from '../../shared/utils/taskHandler';
import { emitMovieProgress, handleMovieTask, handleProcessingError } from './movies.handler';
import { AppError } from '../../shared/errors';
import { taskRegistry } from '../../shared/utils/taskRegistry';

export const createMovieStorageKey = (movieId: string, versionId: string, ext: string) => `movies/${movieId}/${versionId}${ext}`;

taskHandler.addListener('started', (taskId) => handleMovieTask(taskId, 'started'));
taskHandler.addListener('completed', (taskId) => handleMovieTask(taskId, 'completed'));
taskHandler.addListener('canceled', (taskId) => handleMovieTask(taskId, 'canceled'));
taskHandler.addListener('error', (taskId, e) => handleProcessingError(taskId, e, 'task')); // this should be already catched in func handleVideoProcess

const handleVideoProcess = (movieVer: MovieVersion, originalPath: string, outputPath: string) => {
    const runnable = () =>
        processTask(movieVer, originalPath, outputPath).catch((e) => {
            handleProcessingError(movieVer.id, e, 'transcode');
            return -1;
        });

    taskHandler.handle(runnable, movieVer.id);
};

export const startProcessing = async (movieId: string, tasksToRun: number[], storageFolder: string, originalPath: string) => {
    // insert tasks into db
    const tasksVersions = tasksToRun.map<NewMovieVersion>((height) => {
        const versionId = randomUUID();
        const storageKey = createMovieStorageKey(movieId, versionId, '.mp4');
        return {
            id: versionId,
            movieId: movieId,
            width: null,
            height: height,
            isOriginal: false,
            storageKey,
            fileSize: 0,
            mimeType: 'video/mp4',
            status: 'waiting' as const,
        };
    });
    const waitingTasks: MovieVersion[] = await db
        .insert(movieVersions)
        .values(tasksVersions)
        .returning()
        .catch(async (err) => {
            throw new AppError('Database insert failed for movie version', { cause: err });
        });

    waitingTasks.forEach((task) => handleVideoProcess(task, originalPath, path.join(storageFolder, task.storageKey)));
};

const processTask = async (task: MovieVersion, originalPath: string, outputPath: string): Promise<number> => {
    try {
        await db.update(movieVersions).set({ status: 'processing' }).where(eq(movieVersions.id, task.id));

        try {
            await fs.access(originalPath);
        } catch {
            throw new VideoProcessingError('Original video file not found on disk.');
        }

        const originalMeta = await ffprobe(originalPath);
        const videoStream = originalMeta.streams.find((s) => s.codec_type === 'video');

        const codecName = videoStream?.codec_name;
        const isSameHeight = videoStream?.height === task.height;

        // process
        const isHvec = codecName === 'h265' || codecName === 'hevc';
        const totalDuration = parseFloat(originalMeta.format.duration) || 0;

        const type: JobType = isSameHeight && (codecName === 'h264' || isHvec) ? 'copy' : 'transcode';
        const job = new VideoJob(originalPath, outputPath, type, {
            height: task.height,
            isHvec,
            priority: 1,
            totalDuration,
        });
        taskRegistry.register(task.id, job);
        job.addListener('progress', (progress) => emitMovieProgress(task.movieId, 'processing', progress, task.id));

        const successfull = await job.start();
        taskRegistry.unregister(task.id);
        job.destroy();

        if (!successfull) {
            await fs.unlink(outputPath).catch(() => {});
            return 1;
        }

        const stats = await fs.stat(outputPath);

        // additional check for actual resolution
        const meta = await ffprobe(outputPath);
        const stream = meta.streams.find((s) => s.codec_type === 'video');
        const width = stream?.width ?? 0,
            height = stream?.height ?? task.height;

        // save resolution to database
        await db
            .update(movieVersions)
            .set({
                width,
                height,
                fileSize: stats.size,
                status: 'ready',
            })
            .where(eq(movieVersions.id, task.id));
        return 0;
    } catch (error) {
        await fs.unlink(outputPath).catch(() => {});
        throw error;
    }
};
