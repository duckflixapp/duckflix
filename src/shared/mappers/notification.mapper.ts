import type { AccountNotificationDTO as NotificationDTO } from '@duckflixapp/shared';
import type { Notification } from '@shared/schema';

export const toNotificationDTO = (notification: Notification): NotificationDTO => ({
    id: notification.id,
    accountId: notification.accountId,
    videoId: notification.videoId,
    videoVerId: notification.videoVerId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
});
