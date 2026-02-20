import type { NotificationDTO } from '@duckflix/shared';
import { db } from '../../shared/configs/db';
import { notifications, users } from '../../shared/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { toNotificationDTO, toUserDTO } from '../../shared/mappers/user.mapper';
import { UserNotFoundError } from './user.errors';

export const getMe = async (userId: string) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });

    if (!user) throw new UserNotFoundError();

    return toUserDTO(user);
};

export const getUserNotifications = async (userId: string): Promise<NotificationDTO[]> => {
    const results = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(10);
    return results.map(toNotificationDTO);
};

export const markUserNotifications = async (userId: string, options: { markAll: boolean; notificationIds?: string[] }) => {
    const conditions = [];
    conditions.push(eq(notifications.userId, userId));
    conditions.push(eq(notifications.isRead, false));
    if (!options.markAll) conditions.push(inArray(notifications.id, options.notificationIds ?? []));

    const filters = and(...conditions);

    await db.update(notifications).set({ isRead: true }).where(filters);
};

export const clearUserNotifications = async (userId: string): Promise<void> => {
    await db.delete(notifications).where(eq(notifications.userId, userId));
};
