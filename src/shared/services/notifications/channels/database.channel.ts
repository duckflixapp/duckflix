import { db } from '@shared/configs/db';
import { logger } from '@shared/configs/logger';
import { notifications } from '@shared/schema/notification.schema';
import type { NotificationChannel, NotificationEvent } from '../notification.types';

export class DatabaseChannel implements NotificationChannel {
    async send(senderId: string, events: NotificationEvent[]): Promise<void> {
        if (events.length == 0) return;

        const values = events.map((event) => ({
            accountId: event.userId,
            type: event.type,
            title: event.title,
            message: event.message,
            videoId: event.videoId,
            videoVerId: event.videoVerId,
        }));

        await db
            .insert(notifications)
            .values(values)
            .catch((err) => logger.error({ err, senderId }, 'Failed to save notification to database'));
    }
}
