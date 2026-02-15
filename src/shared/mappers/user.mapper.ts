import type { NotificationDTO, UserDTO, UserMinDTO } from '@duckflix/shared';
import type { Notification, User } from '../schema';

export const toUserMinDTO = (user: Pick<User, 'id' | 'name'>): UserMinDTO => ({
    id: user.id,
    name: user.name,
});

export const toUserDTO = (user: User): UserDTO => ({
    ...toUserMinDTO(user),
    email: user.email,
    createdAt: user.createdAt.toISOString(),
});

export const toNotificationDTO = (notification: Notification): NotificationDTO => ({
    id: notification.id,
    userId: notification.userId,
    movieId: notification.movieId,
    movieVerId: notification.movieVerId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    createdAt: notification.createdAt?.toISOString(),
});
