import { db } from '@shared/configs/db';
import { AppError } from '@shared/errors';
import { users } from '@shared/schema';
import { createAuditLog } from '@shared/services/audit.service';
import argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';

export const resetPassword = async (data: { userId: string; password: string }) => {
    const hashedPassword = await argon2.hash(data.password);

    const [updated] = await db
        .update(users)
        .set({ password: hashedPassword })
        .where(and(eq(users.id, data.userId), eq(users.system, false)))
        .returning({ id: users.id });

    if (!updated) throw new AppError('User not found or deleted', { statusCode: 404 });

    await createAuditLog({
        actorUserId: data.userId,
        action: 'account.password_reset.succeeded',
        targetType: 'user',
        targetId: data.userId,
    });
};
