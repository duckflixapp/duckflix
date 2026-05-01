import type { NotificationDTO } from '@duckflixapp/shared';
import { db } from '@shared/configs/db';
import { accountTotp, accounts, notifications } from '@shared/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { toAccountDTO } from '@shared/mappers/user.mapper';
import { toNotificationDTO } from '@shared/mappers/notification.mapper';
import { UserNotFoundError } from './user.errors';

export const getMe = async (accountId: string) => {
    const result = await db.query.accounts.findFirst({
        where: eq(accounts.id, accountId),
        with: {
            profiles: {
                limit: 1,
            },
        },
    });

    if (!result) throw new UserNotFoundError();

    const [totp] = await db.select().from(accountTotp).where(eq(accountTotp.accountId, result.id)).limit(1);

    return toAccountDTO({ ...result, totpEnabled: Boolean(totp?.enabled && totp.secret) });
};

export const getUserNotifications = async (accountId: string): Promise<NotificationDTO[]> => {
    const results = await db
        .select()
        .from(notifications)
        .where(eq(notifications.accountId, accountId))
        .orderBy(desc(notifications.createdAt))
        .limit(10);
    return results.map(toNotificationDTO);
};

export const markUserNotifications = async (accountId: string, options: { markAll: boolean; notificationIds?: string[] }) => {
    const conditions = [];
    conditions.push(eq(notifications.accountId, accountId));
    conditions.push(eq(notifications.isRead, false));
    if (!options.markAll) conditions.push(inArray(notifications.id, options.notificationIds ?? []));

    const filters = and(...conditions);

    await db.update(notifications).set({ isRead: true }).where(filters);
};

export const clearUserNotifications = async (accountId: string): Promise<void> => {
    await db.delete(notifications).where(eq(notifications.accountId, accountId));
};
