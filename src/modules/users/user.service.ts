import type { NotificationDTO } from '@duckflix/shared';
import { db } from '../../shared/db';
import { notifications, users } from '../../shared/schema';
import { desc, eq } from 'drizzle-orm';
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
