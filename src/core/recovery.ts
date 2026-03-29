import { inArray } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { videos, videoVersions } from '@schema/video.schema';
import { logger } from '@shared/configs/logger';
import { notifyJobStatus } from '@shared/services/notifications/notification.helper';

export const recoverZombieProcesses = async (systemUserId: string) => {
    const zombies = await db.query.videoVersions.findMany({
        where: inArray(videoVersions.status, ['processing', 'waiting']),
    });

    if (zombies.length === 0) return;

    logger.warn({ count: zombies.length }, 'Found zombie movie versions, recovering...');

    await db
        .update(videoVersions)
        .set({ status: 'error' })
        .where(
            inArray(
                videoVersions.id,
                zombies.map((v) => v.id)
            )
        );

    for (const version of zombies) {
        try {
            await notifyJobStatus(
                systemUserId,
                'error',
                'Processing failed',
                `Version ${version.height}p of "${version.videoId}" was interrupted and marked as error.`,
                version.videoId,
                version.id
            ).catch(() => {});

            logger.warn(
                {
                    versionId: version.id,
                    movieId: version.videoId,
                    height: version.height,
                    status: version.status,
                },
                'Zombie version recovered'
            );
        } catch (err) {
            logger.error({ err, versionId: version.id }, 'Failed to recover zombie version');
        }
    }
};

export const recoverZombieMovies = async (systemUserId: string) => {
    const zombies = await db.query.videos.findMany({
        where: inArray(videos.status, ['processing', 'downloading']),
    });

    if (zombies.length === 0) return;

    logger.warn({ count: zombies.length }, 'Found zombie movie, recovering...');

    await db
        .update(videos)
        .set({ status: 'error' })
        .where(
            inArray(
                videos.id,
                zombies.map((v) => v.id)
            )
        );

    for (const video of zombies) {
        try {
            await notifyJobStatus(
                systemUserId,
                'error',
                'Processing failed',
                `Video "${video.id}" was interrupted and marked as error.`,
                video.id
            ).catch(() => {});

            logger.warn(
                {
                    movieId: video.id,
                    status: video.status,
                },
                'Zombie movie recovered'
            );
        } catch (err) {
            logger.error({ err, videoId: video.id }, 'Failed to recover zombie version');
        }
    }
};
