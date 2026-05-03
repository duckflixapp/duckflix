import { and, eq } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { getSystemAccountId } from '@shared/configs/system';
import { accounts } from '@schema/user.schema';
import { notificationService } from './notification.service';
import type { NotificationEvent } from './notification.types';

export const notifyJobStatus = async (
    accountId: string,
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

    const isSystem = accountId === getSystemAccountId();
    const targetIds: string[] = [];

    if (isSystem) {
        const admins = await db
            .select({ id: accounts.id })
            .from(accounts)
            .where(and(eq(accounts.role, 'admin'), eq(accounts.system, false)));
        targetIds.push(...admins.map((a) => a.id));
    } else targetIds.push(accountId);

    const values = targetIds.map((id) => ({
        accountId: id,
        videoId: videoId ?? null,
        videoVerId: videoVerId ?? null,
        type: finalType,
        title,
        message,
    })) satisfies NotificationEvent[];

    notificationService.send(accountId, ...values);
};
