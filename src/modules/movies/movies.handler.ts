import { eq } from 'drizzle-orm';
import { db } from '../../shared/db';
import { movies, movieVersions, notifications } from '../../shared/schema';
import { AppError } from '../../shared/errors';
import { capitalize } from '../../shared/utils/string';

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

            db.insert(notifications)
                .values({ userId, movieId, type: 'error', title, message })
                .catch((e) => console.error('[NOTIF_FAIL]', e));
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

                db.insert(notifications)
                    .values({
                        userId: movieData.userId,
                        movieId: updatedVersion.movieId,
                        movieVerId: movieVerId,
                        type: 'error',
                        title,
                        message,
                    })
                    .catch((err) => console.error('[NOTIF_FAIL]', err));
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
        const [updatedVersion] = await db.update(movieVersions).set({ status: 'error' }).where(eq(movieVersions.id, movieVerId)).returning({
            movieId: movieVersions.movieId,
        });

        if (updatedVersion?.movieId) {
            const [movieData] = await db
                .select({ userId: movies.userId, title: movies.title })
                .from(movies)
                .where(eq(movies.id, updatedVersion.movieId));

            if (movieData?.userId) {
                const title = `Task ${context}`;
                let message = `${capitalize(context)} processing task for: ${movieData.title}`;

                db.insert(notifications)
                    .values({
                        userId: movieData.userId,
                        movieId: updatedVersion.movieId,
                        movieVerId: movieVerId,
                        type: context === 'completed' ? 'success' : 'info',
                        title,
                        message,
                    })
                    .catch((err) => console.error('[NOTIF_FAIL]', err));
            }
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
