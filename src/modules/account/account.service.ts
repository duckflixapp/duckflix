import { db } from '@shared/configs/db';
import { AppError } from '@shared/errors';
import { toAccountSessionDTO, toAccountSessionMinDTO, toAccountTwoFactorStatusDTO } from '@shared/mappers/account.mapper';
import { sessions, totpBackupCodes, users } from '@shared/schema';
import { createAuditLog } from '@shared/services/audit.service';
import type { AccountSessionDTO, AccountSessionMinDTO, AccountTwoFactorStatusDTO } from '@duckflixapp/shared';
import argon2 from 'argon2';
import { and, count, desc, eq, gt, isNull, ne } from 'drizzle-orm';

export const deleteAccount = async (userId: string) => {
    await db.transaction(async (tx) => {
        const [user] = await tx
            .select({ id: users.id, email: users.email, system: users.system })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        if (!user || user.system) throw new AppError('User not found', { statusCode: 404 });

        await createAuditLog(
            {
                actorUserId: user.id,
                action: 'account.deleted',
                targetType: 'user',
                targetId: user.id,
                metadata: { email: user.email },
            },
            tx
        );

        await tx.delete(users).where(and(eq(users.id, userId), eq(users.system, false)));
    });
};

export const getSessions = async (data: { userId: string; currentSessionId: string }): Promise<AccountSessionMinDTO[]> => {
    const result = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, data.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date().toISOString())))
        .limit(100)
        .orderBy(desc(sessions.lastRefreshedAt));

    return result.map((s) => toAccountSessionMinDTO(s, data.currentSessionId ?? null));
};

export const getSessionById = async (data: {
    userId: string;
    sessionId: string;
    currentSessionId?: string | null;
}): Promise<AccountSessionDTO> => {
    const [session] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, data.userId), eq(sessions.id, data.sessionId)))
        .limit(1);

    if (!session) throw new AppError('Session not found', { statusCode: 404 });

    return toAccountSessionDTO(session, data.currentSessionId);
};

export const revokeSessionById = async (data: { userId: string; sessionId: string; currentSessionId: string }): Promise<void> => {
    if (data.sessionId == data.currentSessionId)
        throw new AppError('User should not be able to revoke his session. Please use logout', { statusCode: 403 });

    await db
        .update(sessions)
        .set({ revokedAt: new Date().toISOString() })
        .where(and(eq(sessions.userId, data.userId), eq(sessions.id, data.sessionId)));
    return;
};

export const resetPassword = async (data: { userId: string; password: string; sessionId: string }) => {
    const hashedPassword = await argon2.hash(data.password);

    await db.transaction(async (tx) => {
        const [updated] = await tx
            .update(users)
            .set({ password: hashedPassword })
            .where(and(eq(users.id, data.userId), eq(users.system, false)))
            .returning({ id: users.id });

        if (!updated) throw new AppError('User not found or deleted', { statusCode: 404 });

        await tx
            .update(sessions)
            .set({ revokedAt: new Date().toISOString() })
            .where(and(eq(sessions.userId, data.userId), isNull(sessions.revokedAt), ne(sessions.id, data.sessionId)));

        await createAuditLog(
            {
                actorUserId: data.userId,
                action: 'account.password_reset.succeeded',
                targetType: 'user',
                targetId: data.userId,
            },
            tx
        );
    });
};

export const getTwoFactorStatus = async (userId: string): Promise<AccountTwoFactorStatusDTO> => {
    const user = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.system, false)),
        columns: { totpEnabled: true, totpSecret: true, totpSecretPending: true },
    });

    if (!user) throw new AppError('User not found', { statusCode: 404 });

    const authenticatorEnabled = user.totpEnabled && !!user.totpSecret;
    const [backupCodes] = await db
        .select({ remaining: count() })
        .from(totpBackupCodes)
        .where(and(eq(totpBackupCodes.userId, userId), isNull(totpBackupCodes.usedAt)));

    const remainingBackupCodes = backupCodes?.remaining ?? 0;

    return toAccountTwoFactorStatusDTO({
        authenticatorEnabled,
        authenticatorPendingSetup: !authenticatorEnabled && !!user.totpSecretPending,
        remainingBackupCodes,
    });
};
