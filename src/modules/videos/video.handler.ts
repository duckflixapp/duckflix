import { eq } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { videos, videoVersions } from '@shared/schema/video.schema';
import { AppError } from '@shared/errors';
import { capitalize } from '@utils/string';
import type { DownloadProgress, JobProgress } from '@duckflixapp/shared';
import { notifyJobStatus } from '@shared/services/notifications/notification.helper';
import { logger } from '@shared/configs/logger';
import { socket } from '@server';

export const handleWorkflowError = async (videoId: string, error: unknown, context: 'video' | 'torrent') => {
    try {
        const [updatedVideo] = await db
            .update(videos)
            .set({ status: 'error' })
            .where(eq(videos.id, videoId))
            .returning({ accountId: videos.uploaderId });

        const accountId = updatedVideo?.accountId;
        if (accountId) {
            const title = `Error while processing ${context}`;
            let message = 'Unexpected error.';
            if (error instanceof AppError) message = error.message;

            notifyJobStatus(accountId, 'error', title, message, videoId);
        }
    } catch (err: unknown) {
        logger.fatal({ err, videoId, context }, 'CRITICAL: Failed to mark video status as error in DB');
    }
    logger.error(
        {
            err: error,
            videoId,
            context,
            workflowStep: 'handleWorkflowError',
        },
        `Workflow error in ${context}`
    );
};

export const handleProcessingError = async (videoVerId: string, error: unknown, context: 'transcode' | 'task') => {
    try {
        const [updatedVersion] = await db.update(videoVersions).set({ status: 'error' }).where(eq(videoVersions.id, videoVerId)).returning({
            videoId: videoVersions.videoId,
        });

        if (updatedVersion?.videoId) {
            const [videoData] = await db.select({ accountId: videos.uploaderId }).from(videos).where(eq(videos.id, updatedVersion.videoId));

            if (videoData?.accountId) {
                const title = `Error while ${context === 'task' ? 'doing task' : ' transcoding video'}`;
                let message = 'Unexpected error.';

                if (error instanceof AppError) {
                    message = error.message;
                }

                if (updatedVersion?.videoId)
                    notifyJobStatus(videoData?.accountId, 'error', title, message, updatedVersion.videoId, videoVerId);
            }
        }
    } catch (err: unknown) {
        logger.fatal({ err, videoVerId, context }, 'CRITICAL: Failed to update video version status to error');
    }
    logger.error(
        {
            err: error,
            videoVerId,
            context,
            workflowStep: 'handleProcessingError',
        },
        `Processing failed during ${context}`
    );
};

export const handleVideoTask = async (videoVerId: string, context: 'started' | 'completed' | 'canceled') => {
    try {
        const [updatedVersion] = await db
            .select({ videoId: videoVersions.videoId })
            .from(videoVersions)
            .where(eq(videoVersions.id, videoVerId));

        if (updatedVersion?.videoId) {
            const [videoData] = await db
                .select({ id: videos.id, accountId: videos.uploaderId })
                .from(videos)
                .where(eq(videos.id, updatedVersion.videoId));

            if (!videoData?.accountId) return;

            const title = `Task ${context}`;
            let message = `${capitalize(context)} processing task for: ${videoData.id}`;

            if (updatedVersion?.videoId) notifyJobStatus(videoData?.accountId, context, title, message, updatedVersion.videoId, videoVerId);
        }
        logger.info({ videoVerId, context }, `Video task ${context}`);
    } catch (err: unknown) {
        logger.error({ err, videoVerId }, 'Failed to send video task notification');
    }
    logger.debug({ videoVerId }, `[VideoTask] processing task ${context}`);
};

export const emitVideoProgress = (
    videoId: string,
    status: 'downloading' | 'processing' | 'error',
    progress?: JobProgress | DownloadProgress,
    versionId?: string
) => {
    socket.to(`video:${videoId}`).emit('video:progress', {
        status,
        versionId,
        progress,
    });
};
