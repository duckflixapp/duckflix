import { db } from '@shared/configs/db';
import { AppError } from '@shared/errors';
import { toAccountSessionDTO, toAccountSessionMinDTO, toAccountTwoFactorStatusDTO } from '@shared/mappers/account.mapper';
import { toNotificationDTO } from '@shared/mappers/notification.mapper';
import { accountTotp, accounts, notifications, sessions, totpBackupCodes } from '@shared/schema';
import { createAuditLog } from '@shared/services/audit.service';
import type { AccountSessionDTO, AccountSessionMinDTO, AccountTwoFactorStatusDTO, NotificationDTO, UserRole } from '@duckflixapp/shared';
import argon2 from 'argon2';
import { and, count, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';

export type AccountMeDTO = {
    id: string;
    email: string;
    role: UserRole;
    system: boolean;
    isVerified: boolean;
    isTotpEnabled: boolean;
    createdAt: string;
};

export const getMe = async (accountId: string): Promise<AccountMeDTO> => {
    const [account] = await db
        .select({
            id: accounts.id,
            email: accounts.email,
            role: accounts.role,
            system: accounts.system,
            isVerified: accounts.verified_email,
            createdAt: accounts.createdAt,
        })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);

    if (!account) throw new AppError('Account not found', { statusCode: 404 });

    const [totp] = await db.select().from(accountTotp).where(eq(accountTotp.accountId, account.id)).limit(1);

    return {
        ...account,
        isTotpEnabled: Boolean(totp?.enabled && totp.secret),
    };
};

export const getAccountNotifications = async (accountId: string): Promise<NotificationDTO[]> => {
    const results = await db
        .select()
        .from(notifications)
        .where(eq(notifications.accountId, accountId))
        .orderBy(desc(notifications.createdAt))
        .limit(10);

    return results.map(toNotificationDTO);
};

export const markAccountNotifications = async (accountId: string, options: { markAll: boolean; notificationIds?: string[] }) => {
    const conditions = [eq(notifications.accountId, accountId), eq(notifications.isRead, false)];
    if (!options.markAll) conditions.push(inArray(notifications.id, options.notificationIds ?? []));

    await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(...conditions));
};

export const clearAccountNotifications = async (accountId: string): Promise<void> => {
    await db.delete(notifications).where(eq(notifications.accountId, accountId));
};

export const deleteAccount = async (accountId: string) => {
    await db.transaction(async (tx) => {
        const [account] = await tx
            .select({ id: accounts.id, email: accounts.email, system: accounts.system })
            .from(accounts)
            .where(eq(accounts.id, accountId))
            .limit(1);

        if (!account || account.system) throw new AppError('User not found', { statusCode: 404 });

        await createAuditLog(
            {
                actorAccountId: account.id,
                action: 'account.deleted',
                targetType: 'user',
                targetId: account.id,
                metadata: { email: account.email },
            },
            tx
        );

        await tx.delete(accounts).where(and(eq(accounts.id, accountId), eq(accounts.system, false)));
    });
};

export const getSessions = async (data: { accountId: string; currentSessionId: string }): Promise<AccountSessionMinDTO[]> => {
    const result = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.accountId, data.accountId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date().toISOString())))
        .limit(100)
        .orderBy(desc(sessions.lastRefreshedAt));

    return result.map((s) => toAccountSessionMinDTO(s, data.currentSessionId ?? null));
};

export const getSessionById = async (data: {
    accountId: string;
    sessionId: string;
    currentSessionId?: string | null;
}): Promise<AccountSessionDTO> => {
    const [session] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.accountId, data.accountId), eq(sessions.id, data.sessionId)))
        .limit(1);

    if (!session) throw new AppError('Session not found', { statusCode: 404 });

    return toAccountSessionDTO(session, data.currentSessionId);
};

export const revokeSessionById = async (data: { accountId: string; sessionId: string; currentSessionId: string }): Promise<void> => {
    if (data.sessionId == data.currentSessionId)
        throw new AppError('User should not be able to revoke this session. Please use logout', { statusCode: 403 });

    await db
        .update(sessions)
        .set({ revokedAt: new Date().toISOString() })
        .where(and(eq(sessions.accountId, data.accountId), eq(sessions.id, data.sessionId)));
    return;
};

export const resetPassword = async (data: { accountId: string; password: string; sessionId: string }) => {
    const hashedPassword = await argon2.hash(data.password);

    await db.transaction(async (tx) => {
        const [updated] = await tx
            .update(accounts)
            .set({ password: hashedPassword })
            .where(and(eq(accounts.id, data.accountId), eq(accounts.system, false)))
            .returning({ id: accounts.id });

        if (!updated) throw new AppError('User not found or deleted', { statusCode: 404 });

        await tx
            .update(sessions)
            .set({ revokedAt: new Date().toISOString() })
            .where(and(eq(sessions.accountId, data.accountId), isNull(sessions.revokedAt), ne(sessions.id, data.sessionId)));

        await createAuditLog(
            {
                actorAccountId: data.accountId,
                action: 'account.password_reset.succeeded',
                targetType: 'user',
                targetId: data.accountId,
            },
            tx
        );
    });
};

export const getTwoFactorStatus = async (accountId: string): Promise<AccountTwoFactorStatusDTO> => {
    const [account] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.system, false)))
        .limit(1);

    if (!account) throw new AppError('User not found', { statusCode: 404 });

    const [totp] = await db.select().from(accountTotp).where(eq(accountTotp.accountId, accountId)).limit(1);

    const authenticatorEnabled = Boolean(totp?.enabled && totp.secret);
    const [backupCodes] = await db
        .select({ remaining: count() })
        .from(totpBackupCodes)
        .where(and(eq(totpBackupCodes.accountId, accountId), isNull(totpBackupCodes.usedAt)));

    const remainingBackupCodes = backupCodes?.remaining ?? 0;

    return toAccountTwoFactorStatusDTO({
        authenticatorEnabled,
        authenticatorPendingSetup: !authenticatorEnabled && !!totp?.pendingSecret,
        remainingBackupCodes,
    });
};
