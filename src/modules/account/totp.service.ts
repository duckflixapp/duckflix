import { db } from '@shared/configs/db';
import { AppError } from '@shared/errors';
import { accountTotp, accounts, totpBackupCodes } from '@shared/schema';
import { createAuditLog } from '@shared/services/audit.service';
import argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { generateSecret, generateURI, verify } from 'otplib';
import qrcode from 'qrcode';
import crypto from 'node:crypto';

export const getTotpSetup = async (accountId: string) => {
    const [account] = await db
        .select({ email: accounts.email })
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.system, false)))
        .limit(1);

    if (!account) throw new AppError('User not found', { statusCode: 404 });

    const [totp] = await db.select().from(accountTotp).where(eq(accountTotp.accountId, accountId)).limit(1);
    const secret = totp?.pendingSecret ?? generateSecret();

    if (!totp?.pendingSecret) {
        if (totp) {
            await db
                .update(accountTotp)
                .set({ pendingSecret: secret, updatedAt: new Date().toISOString() })
                .where(eq(accountTotp.accountId, accountId));
        } else {
            await db.insert(accountTotp).values({ accountId, pendingSecret: secret });
        }
    }

    const otpauth = generateURI({ issuer: 'DuckFlix', label: account.email, secret });
    const qrCodeUrl = await qrcode.toDataURL(otpauth);

    const manualKey = secret.match(/.{1,4}/g)?.join(' ') ?? secret;

    return { qrCodeUrl, manualKey };
};

export const cancelTotpSetup = async (accountId: string) => {
    await db
        .update(accountTotp)
        .set({ pendingSecret: null, updatedAt: new Date().toISOString() })
        .where(eq(accountTotp.accountId, accountId));
};

export const activateTotp = async (accountId: string, code: string) => {
    const [totp] = await db.select().from(accountTotp).where(eq(accountTotp.accountId, accountId)).limit(1);

    if (!totp?.pendingSecret) {
        throw new AppError('No pending TOTP setup found', { statusCode: 400 });
    }

    const result = await verify({ token: code, secret: totp.pendingSecret });
    if (!result.valid) throw new AppError('Invalid code', { statusCode: 400 });

    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
    const hashedBackupCodes = await Promise.all(backupCodes.map((c) => argon2.hash(c)));

    await db.transaction(async (tx) => {
        await tx
            .update(accountTotp)
            .set({
                secret: totp.pendingSecret,
                pendingSecret: null,
                enabled: true,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(accountTotp.accountId, accountId));

        await tx.delete(totpBackupCodes).where(eq(totpBackupCodes.accountId, accountId));
        await tx.insert(totpBackupCodes).values(hashedBackupCodes.map((hash) => ({ accountId, codeHash: hash })));
    });

    await createAuditLog({
        actorAccountId: accountId,
        action: 'account.totp.activated',
        targetType: 'user',
        targetId: accountId,
    });

    return { backupCodes };
};

export const deactivateTotp = async (accountId: string) => {
    const [account] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.system, false)))
        .limit(1);

    if (!account) throw new AppError('User not found', { statusCode: 404 });

    await db.transaction(async (tx) => {
        await tx
            .update(accountTotp)
            .set({ enabled: false, secret: null, pendingSecret: null, updatedAt: new Date().toISOString() })
            .where(eq(accountTotp.accountId, accountId));

        await tx.delete(totpBackupCodes).where(eq(totpBackupCodes.accountId, accountId));
    });

    await createAuditLog({
        actorAccountId: accountId,
        action: 'account.totp.deactivated',
        targetType: 'user',
        targetId: accountId,
    });
};
