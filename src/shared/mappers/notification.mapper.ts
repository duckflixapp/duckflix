import type { NotificationDTO } from '@duckflix/shared';
import type { Notification } from '@shared/schema';

export const toNotificationDTO = (notification: Notification): NotificationDTO => ({
    id: notification.id,
    userId: notification.userId,
    videoId: notification.videoId,
    videoVerId: notification.videoVerId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
});
