import path from 'node:path';
import fs from 'node:fs/promises';
import { db } from '../../shared/db';
import { movieVersions, type MovieVersion, type NewMovieVersion } from '../../shared/schema';
import { ffprobe, transcode } from '../../shared/utils/videoProcessor';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { VideoProcessingError } from './movies.errors';
import { TaskHandler } from '../../shared/utils/tasks';
import { handleMovieTask, handleProcessingError } from './movies.handler';
import { limits } from '../../shared/configs/limits.config';

export const createMovieStorageKey = (movieId: string, versionId: string, ext: string) => `movies/${movieId}/${versionId}${ext}`;

const taskHandler = new TaskHandler({ concurrent: limits.processing.concurrent });
const taskMovies = new Map<string, string>();

taskHandler.addListener('started', (taskId) => handleMovieTask(taskMovies.get(taskId)!, taskId, 'started'));
taskHandler.addListener('completed', (taskId) => handleMovieTask(taskMovies.get(taskId)!, taskId, 'completed'));
taskHandler.addListener('error', (taskId, e) => handleProcessingError(taskMovies.get(taskId)!, e, 'task')); // this should be already catched in func handleVideoProcess

const handleVideoProcess = (movieVer: MovieVersion, originalPath: string, outputPath: string) => {
    const runnable = () => processTask(movieVer, originalPath, outputPath).catch((e) => handleProcessingError(movieVer.id, e, 'transcode'));

    const taskId = randomUUID();
    taskMovies.set(taskId, movieVer.id);
    taskHandler.handle(runnable, taskId);
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
    const waitingTasks: MovieVersion[] = await db.insert(movieVersions).values(tasksVersions).returning();

    waitingTasks.forEach((task) => handleVideoProcess(task, originalPath, path.join(storageFolder, task.storageKey)));
};

const processTask = async (task: MovieVersion, originalPath: string, outputPath: string) => {
    try {
        await db.update(movieVersions).set({ status: 'processing' }).where(eq(movieVersions.id, task.id));

        try {
            await fs.access(originalPath);
        } catch {
            throw new VideoProcessingError('Original video file not found on disk.');
        }

        // transcode process
        await transcode(originalPath, outputPath, task.height);
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
    } catch (error) {
        throw error;
    }
};
