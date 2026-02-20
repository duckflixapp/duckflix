import { eq } from 'drizzle-orm';
import { db } from '../../shared/configs/db';
import { movies, movieVersions } from '../../shared/schema';
import { AppError } from '../../shared/errors';
import { capitalize } from '../../shared/utils/string';
import { io } from '../../server';
import type { DownloadProgress, JobProgress } from '@duckflix/shared';
import { notifyJobStatus } from '../../shared/services/notification.service';

export const handleWorkflowError = async (movieId: string, error: unknown, context: 'movie' | 'torrent') => {
    try {
        const [updatedMovie] = await db
            .update(movies)
            .set({ status: 'error' })
            .where(eq(movies.id, movieId))
            .returning({ userId: movies.userId });

        const userId = updatedMovie?.userId;
        if (userId) {
            const title = `Error while processing ${context}`;
            let message = 'Unexpected error.';
            if (error instanceof AppError) message = error.message;

            notifyJobStatus(userId, 'error', title, message, movieId);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error(`[CRITICAL_DB_ERROR] Failed during processing workflow error update:`, {
            code: err.code,
            message: err.message,
        });
    }
    // handle better logging
    console.error(`[${context}] Error for movie ${movieId}:`, error);
};

export const handleProcessingError = async (movieVerId: string, error: unknown, context: 'transcode' | 'task') => {
    try {
        const [updatedVersion] = await db.update(movieVersions).set({ status: 'error' }).where(eq(movieVersions.id, movieVerId)).returning({
            movieId: movieVersions.movieId,
        });

        if (updatedVersion?.movieId) {
            const [movieData] = await db.select({ userId: movies.userId }).from(movies).where(eq(movies.id, updatedVersion.movieId));

            if (movieData?.userId) {
                const title = `Error while ${context === 'task' ? 'doing task' : ' transcoding video'}`;
                let message = 'Unexpected error.';

                if (error instanceof AppError) {
                    message = error.message;
                }

                if (updatedVersion?.movieId)
                    notifyJobStatus(movieData?.userId, 'error', title, message, updatedVersion.movieId, movieVerId);
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error(`[CRITICAL_DB_ERROR] Failed during processing error update:`, {
            code: err.code,
            message: err.message,
        });
    }
    // handle better logging
    console.error(`[${context}] Error for movie version ${movieVerId}:`, error);
};

export const handleMovieTask = async (movieVerId: string, taskId: string, context: 'started' | 'completed') => {
    try {
        const [updatedVersion] = await db
            .select({ movieId: movieVersions.movieId })
            .from(movieVersions)
            .where(eq(movieVersions.id, movieVerId));

        if (updatedVersion?.movieId) {
            const [movieData] = await db
                .select({ userId: movies.userId, title: movies.title })
                .from(movies)
                .where(eq(movies.id, updatedVersion.movieId));

            if (!movieData?.userId) return;

            const title = `Task ${context}`;
            let message = `${capitalize(context)} processing task for: ${movieData.title}`;

            if (updatedVersion?.movieId) notifyJobStatus(movieData?.userId, context, title, message, updatedVersion.movieId, movieVerId);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error(`[DB_ERROR] Failed during processing movie notification:`, {
            code: err.code,
            message: err.message,
        });
    }
    console.log(`[MovieTask] ${context} processing task: ${taskId}, movie ver. ${movieVerId}`);
};

export const emitMovieProgress = (
    movieId: string,
    status: 'downloading' | 'processing' | 'error',
    progress?: JobProgress | DownloadProgress,
    versionId?: string
) => {
    io.to(`movie:${movieId}`).emit('video:progress', {
        status,
        versionId,
        progress,
    });
};
