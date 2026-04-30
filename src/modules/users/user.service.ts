import type { NotificationDTO } from '@duckflixapp/shared';
import { db } from '@shared/configs/db';
import { accountTotp, users, notifications } from '@shared/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { toUserDTO } from '@shared/mappers/user.mapper';
import { toNotificationDTO } from '@shared/mappers/notification.mapper';
import { UserNotFoundError } from './user.errors';

export const getMe = async (userId: string) => {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) throw new UserNotFoundError();

    const [totp] = await db.select().from(accountTotp).where(eq(accountTotp.accountId, user.id)).limit(1);

    return toUserDTO({ ...user, totpEnabled: Boolean(totp?.enabled && totp.secret) });
};

export const getUserNotifications = async (userId: string): Promise<NotificationDTO[]> => {
    const results = await db
        .select()
        .from(notifications)
        .where(eq(notifications.accountId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(10);
    return results.map(toNotificationDTO);
};

export const markUserNotifications = async (userId: string, options: { markAll: boolean; notificationIds?: string[] }) => {
    const conditions = [];
    conditions.push(eq(notifications.accountId, userId));
    conditions.push(eq(notifications.isRead, false));
    if (!options.markAll) conditions.push(inArray(notifications.id, options.notificationIds ?? []));

    const filters = and(...conditions);

    await db.update(notifications).set({ isRead: true }).where(filters);
};

export const clearUserNotifications = async (userId: string): Promise<void> => {
    await db.delete(notifications).where(eq(notifications.accountId, userId));
};
