import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@shared/configs/db';
import { isDuplicateKey } from '@shared/db.errors';
import { accountTokens, accountTotp, accounts, profiles, sessions, totpBackupCodes } from '@shared/schema';
import {
    AuthAccountCreateFailedError,
    DuplicateAuthEmailError,
    type AuthAccountRecord,
    type AuthRepository,
    type CreateAccountWithVerificationTokenInput,
    type CreateSessionInput,
    type RefreshSessionInput,
} from './auth.ports';

const toAccountRecord = (account: typeof accounts.$inferSelect): AuthAccountRecord => ({
    id: account.id,
    email: account.email,
    isVerified: account.verified_email,
    password: account.password,
    role: account.role,
    system: account.system,
    createdAt: account.createdAt,
});

export const drizzleAuthRepository: AuthRepository = {
    async getAccountTotp(accountId: string) {
        const [totp] = await db.select().from(accountTotp).where(eq(accountTotp.accountId, accountId)).limit(1);
        return totp ?? null;
    },

    async findFirstProfile(accountId: string) {
        const [profile] = await db.select().from(profiles).where(eq(profiles.accountId, accountId)).limit(1);
        return profile ?? null;
    },

    async findAccountByEmail(email: string) {
        const [account] = await db
            .select()
            .from(accounts)
            .where(and(eq(accounts.email, email), eq(accounts.system, false)))
            .limit(1);

        return account ? toAccountRecord(account) : null;
    },

    async findAccountById(accountId: string) {
        const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
        return account ? toAccountRecord(account) : null;
    },

    async findUserAccountById(accountId: string) {
        const [account] = await db
            .select()
            .from(accounts)
            .where(and(eq(accounts.id, accountId), eq(accounts.system, false)))
            .limit(1);

        return account ? toAccountRecord(account) : null;
    },

    async findAccountEmail(accountId: string) {
        const [account] = await db.select({ id: accounts.id, email: accounts.email }).from(accounts).where(eq(accounts.id, accountId));
        return account ?? null;
    },

    async createAccountWithVerificationToken(data: CreateAccountWithVerificationTokenInput) {
        return db.transaction(async (tx) => {
            const existingAccount = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.system, false)).limit(1);

            const [account] = await tx
                .insert(accounts)
                .values({
                    email: data.email,
                    password: data.passwordHash,
                    verified_email: data.isVerified,
                    role: existingAccount.length === 0 ? data.firstAccountRole : data.defaultRole,
                })
                .returning()
                .catch((error) => {
                    if (isDuplicateKey(error)) throw new DuplicateAuthEmailError();
                    throw error;
                });

            if (!account) throw new AuthAccountCreateFailedError();

            if (data.verificationTokenHash && data.verificationTokenExpiresAt)
                await tx.insert(accountTokens).values({
                    accountId: account.id,
                    token: data.verificationTokenHash,
                    type: 'email_verification',
                    expiresAt: data.verificationTokenExpiresAt,
                });

            return toAccountRecord(account);
        });
    },

    async findAccountTokenByHash(data: { tokenHash: string; type: 'email_verification' | 'login_challenge' }) {
        const [storedToken] = await db
            .select()
            .from(accountTokens)
            .where(and(eq(accountTokens.token, data.tokenHash), eq(accountTokens.type, data.type)))
            .limit(1);

        return storedToken ?? null;
    },

    async createLoginChallenge(data: { accountId: string; tokenHash: string; expiresAt: string }) {
        await db.transaction(async (tx) => {
            await tx
                .delete(accountTokens)
                .where(and(eq(accountTokens.accountId, data.accountId), eq(accountTokens.type, 'login_challenge')));
            await tx.insert(accountTokens).values({
                accountId: data.accountId,
                token: data.tokenHash,
                type: 'login_challenge',
                expiresAt: data.expiresAt,
            });
        });
    },

    async deleteAccountToken(tokenId: string) {
        await db.delete(accountTokens).where(eq(accountTokens.id, tokenId));
    },

    async verifyEmailToken(data: { accountId: string; tokenId: string }) {
        await db.transaction(async (tx) => {
            await tx.update(accounts).set({ verified_email: true }).where(eq(accounts.id, data.accountId));
            await tx.delete(accountTokens).where(eq(accountTokens.id, data.tokenId));
        });
    },

    async listUnusedBackupCodes(accountId: string) {
        return db
            .select({ id: totpBackupCodes.id, codeHash: totpBackupCodes.codeHash })
            .from(totpBackupCodes)
            .where(and(eq(totpBackupCodes.accountId, accountId), isNull(totpBackupCodes.usedAt)));
    },

    async markBackupCodeUsed(data: { backupCodeId: string; usedAt: Date }) {
        const [used] = await db
            .update(totpBackupCodes)
            .set({ usedAt: data.usedAt })
            .where(and(eq(totpBackupCodes.id, data.backupCodeId), isNull(totpBackupCodes.usedAt)))
            .returning({ id: totpBackupCodes.id });

        return Boolean(used);
    },

    async hasUnusedBackupCode(accountId: string) {
        const [backupCode] = await db
            .select({ id: totpBackupCodes.id })
            .from(totpBackupCodes)
            .where(and(eq(totpBackupCodes.accountId, accountId), isNull(totpBackupCodes.usedAt)))
            .limit(1);

        return Boolean(backupCode);
    },

    async findProfileIdForAccount(data: { accountId: string; profileId: string }) {
        const [profile] = await db
            .select({ id: profiles.id })
            .from(profiles)
            .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
            .limit(1);

        return profile?.id ?? null;
    },

    async createSession(data: CreateSessionInput) {
        const [session] = await db
            .insert(sessions)
            .values({
                accountId: data.accountId,
                token: data.refreshTokenHash,
                deviceName: data.device.deviceName,
                deviceType: data.device.deviceType,
                browserName: data.device.browserName,
                osName: data.device.osName,
                userAgent: data.userAgent,
                ipAddress: data.ip,
                lastIpAddress: data.ip,
                lastRefreshedAt: data.now,
                revokedAt: null,
                expiresAt: data.expiresAt,
            })
            .returning({ id: sessions.id });

        return session?.id ?? null;
    },

    async findSessionByTokenHash(tokenHash: string) {
        return (
            (await db.query.sessions.findFirst({
                where: eq(sessions.token, tokenHash),
            })) ?? null
        );
    },

    async findSessionById(sessionId: string) {
        return (
            (await db.query.sessions.findFirst({
                where: eq(sessions.id, sessionId),
            })) ?? null
        );
    },

    async revokeSessionIfActive(data: { sessionId: string; revokedAt: string }) {
        await db
            .update(sessions)
            .set({ revokedAt: data.revokedAt })
            .where(and(eq(sessions.id, data.sessionId), isNull(sessions.revokedAt)));
    },

    async refreshSession(data: RefreshSessionInput) {
        const [updatedSession] = await db
            .update(sessions)
            .set({
                token: data.refreshTokenHash,
                userAgent: data.userAgent,
                deviceName: data.device.deviceName,
                deviceType: data.device.deviceType,
                browserName: data.device.browserName,
                osName: data.device.osName,
                lastIpAddress: data.lastIpAddress,
                lastRefreshedAt: data.refreshedAt,
                expiresAt: data.expiresAt,
            })
            .where(and(eq(sessions.id, data.sessionId), isNull(sessions.revokedAt)))
            .returning({ id: sessions.id });

        return Boolean(updatedSession);
    },
};
