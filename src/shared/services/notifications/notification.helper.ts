import { and, eq } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { getSystemUserId } from '@shared/configs/system';
import { users } from '@schema/user.schema';
import { notificationService } from './notification.service';
import type { NotificationEvent } from './notification.types';

export const notifyJobStatus = async (
    userId: string,
    status: 'started' | 'completed' | 'downloaded' | 'canceled' | 'error',
    title: string,
    message: string,
    videoId?: string,
    videoVerId?: string
) => {
    const typeMap = {
        completed: 'success',
        canceled: 'warning',
        error: 'error',
        started: 'info',
        downloaded: 'info',
    } as const;

    const finalType = typeMap[status] || 'info';

    const isSystem = userId === getSystemUserId();
    const targetIds: string[] = [];

    if (isSystem) {
        const admins = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.role, 'admin'), eq(users.system, false)));
        targetIds.push(...admins.map((a) => a.id));
    } else targetIds.push(userId);

    const values = targetIds.map((id) => ({
        userId: id,
        videoId: videoId ?? null,
        videoVerId: videoVerId ?? null,
        type: finalType,
        title,
        message,
    })) satisfies NotificationEvent[];

    notificationService.send(userId, ...values);
};
