import { and, count, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';

import { db } from '@shared/configs/db';
import { accountTotp, accounts, auditLogs, notifications, sessions, totpBackupCodes } from '@shared/schema';
import type { AccountRepository } from './account.ports';

export const drizzleAccountRepository: AccountRepository = {
    async findAccountMe(accountId: string) {
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

        return account ?? null;
    },

    async findUserEmail(accountId: string) {
        const [account] = await db
            .select({ email: accounts.email })
            .from(accounts)
            .where(and(eq(accounts.id, accountId), eq(accounts.system, false)))
            .limit(1);

        return account ?? null;
    },

    async userExists(accountId: string) {
        const [account] = await db
            .select({ id: accounts.id })
            .from(accounts)
            .where(and(eq(accounts.id, accountId), eq(accounts.system, false)))
            .limit(1);

        return Boolean(account);
    },

    async getTotp(accountId: string) {
        const [totp] = await db.select().from(accountTotp).where(eq(accountTotp.accountId, accountId)).limit(1);
        return totp ?? null;
    },

    async listNotifications(accountId: string, options: { page: number; limit: number }) {
        const offset = (options.page - 1) * options.limit;

        return db.transaction(async (tx) => {
            const [total] = await tx.select({ totalItems: count() }).from(notifications).where(eq(notifications.accountId, accountId));

            const results = await tx
                .select()
                .from(notifications)
                .where(eq(notifications.accountId, accountId))
                .orderBy(desc(notifications.createdAt))
                .limit(options.limit)
                .offset(offset);

            return {
                results,
                totalItems: total?.totalItems ?? 0,
            };
        });
    },

    async markNotifications(accountId: string, options: { markAll: boolean; notificationIds?: string[] }) {
        const conditions = [eq(notifications.accountId, accountId), eq(notifications.isRead, false)];
        if (!options.markAll) conditions.push(inArray(notifications.id, options.notificationIds ?? []));

        await db
            .update(notifications)
            .set({ isRead: true })
            .where(and(...conditions));
    },

    async clearNotifications(accountId: string) {
        await db.delete(notifications).where(eq(notifications.accountId, accountId));
    },

    async deleteAccountWithAudit(accountId: string) {
        return db.transaction(async (tx) => {
            const [account] = await tx
                .select({ id: accounts.id, email: accounts.email, system: accounts.system })
                .from(accounts)
                .where(eq(accounts.id, accountId))
                .limit(1);

            if (!account || account.system) return false;

            await tx.insert(auditLogs).values({
                actorAccountId: account.id,
                action: 'account.deleted',
                targetType: 'user',
                targetId: account.id,
                metadata: { email: account.email },
            });

            await tx.delete(accounts).where(and(eq(accounts.id, accountId), eq(accounts.system, false)));
            return true;
        });
    },

    async listActiveSessions(data: { accountId: string; now: string }) {
        return db
            .select()
            .from(sessions)
            .where(and(eq(sessions.accountId, data.accountId), isNull(sessions.revokedAt), gt(sessions.expiresAt, data.now)))
            .orderBy(desc(sessions.lastRefreshedAt))
            .limit(100);
    },

    async findSessionById(data: { accountId: string; sessionId: string }) {
        const [session] = await db
            .select()
            .from(sessions)
            .where(and(eq(sessions.accountId, data.accountId), eq(sessions.id, data.sessionId)))
            .limit(1);

        return session ?? null;
    },

    async revokeSession(data: { accountId: string; sessionId: string; revokedAt: string }) {
        await db
            .update(sessions)
            .set({ revokedAt: data.revokedAt })
            .where(and(eq(sessions.accountId, data.accountId), eq(sessions.id, data.sessionId)));
    },

    async resetPasswordWithAudit(data: { accountId: string; passwordHash: string; currentSessionId: string; revokedAt: string }) {
        return db.transaction(async (tx) => {
            const [updated] = await tx
                .update(accounts)
                .set({ password: data.passwordHash })
                .where(and(eq(accounts.id, data.accountId), eq(accounts.system, false)))
                .returning({ id: accounts.id });

            if (!updated) return false;

            await tx
                .update(sessions)
                .set({ revokedAt: data.revokedAt })
                .where(and(eq(sessions.accountId, data.accountId), isNull(sessions.revokedAt), ne(sessions.id, data.currentSessionId)));

            await tx.insert(auditLogs).values({
                actorAccountId: data.accountId,
                action: 'account.password_reset.succeeded',
                targetType: 'user',
                targetId: data.accountId,
                metadata: {},
            });

            return true;
        });
    },

    async countUnusedBackupCodes(accountId: string) {
        const [backupCodes] = await db
            .select({ remaining: count() })
            .from(totpBackupCodes)
            .where(and(eq(totpBackupCodes.accountId, accountId), isNull(totpBackupCodes.usedAt)));

        return backupCodes?.remaining ?? 0;
    },

    async savePendingTotp(data: { accountId: string; pendingSecret: string; updatedAt: string }) {
        await db
            .insert(accountTotp)
            .values({ accountId: data.accountId, pendingSecret: data.pendingSecret })
            .onConflictDoUpdate({
                target: accountTotp.accountId,
                set: { pendingSecret: data.pendingSecret, updatedAt: data.updatedAt },
            });
    },

    async cancelPendingTotp(data: { accountId: string; updatedAt: string }) {
        await db
            .update(accountTotp)
            .set({ pendingSecret: null, updatedAt: data.updatedAt })
            .where(eq(accountTotp.accountId, data.accountId));
    },

    async activateTotp(data: { accountId: string; secret: string; backupCodeHashes: string[]; updatedAt: string }) {
        await db.transaction(async (tx) => {
            await tx
                .update(accountTotp)
                .set({
                    secret: data.secret,
                    pendingSecret: null,
                    enabled: true,
                    updatedAt: data.updatedAt,
                })
                .where(eq(accountTotp.accountId, data.accountId));

            await tx.delete(totpBackupCodes).where(eq(totpBackupCodes.accountId, data.accountId));
            await tx.insert(totpBackupCodes).values(data.backupCodeHashes.map((hash) => ({ accountId: data.accountId, codeHash: hash })));
        });
    },

    async deactivateTotp(data: { accountId: string; updatedAt: string }) {
        await db.transaction(async (tx) => {
            await tx
                .update(accountTotp)
                .set({ enabled: false, secret: null, pendingSecret: null, updatedAt: data.updatedAt })
                .where(eq(accountTotp.accountId, data.accountId));

            await tx.delete(totpBackupCodes).where(eq(totpBackupCodes.accountId, data.accountId));
        });
    },
};
