import { eq } from 'drizzle-orm';
import { db } from '../../shared/configs/db';
import { movies, movieVersions } from '../../shared/schema';
import { AppError } from '../../shared/errors';
import { capitalize } from '../../shared/utils/string';
import { io } from '../../server';
import type { DownloadProgress, JobProgress } from '@duckflix/shared';
import { notifyJobStatus } from '../../shared/services/notification.service';
import { logger } from '../../shared/utils/logger';

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
    } catch (err: unknown) {
        logger.fatal({ err, movieId, context }, 'CRITICAL: Failed to mark movie status as error in DB');
    }
    logger.error(
        {
            err: error,
            movieId,
            context,
            workflowStep: 'handleWorkflowError',
        },
        `Workflow error in ${context}`
    );
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
    } catch (err: unknown) {
        logger.fatal({ err, movieVerId, context }, 'CRITICAL: Failed to update movie version status to error');
    }
    logger.error(
        {
            err: error,
            movieVerId,
            context,
            workflowStep: 'handleProcessingError',
        },
        `Processing failed during ${context}`
    );
};

export const handleMovieTask = async (movieVerId: string, context: 'started' | 'completed' | 'canceled') => {
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
        logger.info({ movieVerId, context }, `Movie task ${context}`);
    } catch (err: unknown) {
        logger.error({ err, movieVerId }, 'Failed to send movie task notification');
    }
    logger.debug({ movieVerId }, `[MovieTask] processing task ${context}`);
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
