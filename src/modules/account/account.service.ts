import { db } from '@shared/configs/db';
import { AppError } from '@shared/errors';
import { toAccountTwoFactorStatusDTO } from '@shared/mappers/account.mapper';
import { totpBackupCodes, users } from '@shared/schema';
import { createAuditLog } from '@shared/services/audit.service';
import type { AccountTwoFactorStatusDTO } from '@duckflixapp/shared';
import argon2 from 'argon2';
import { and, count, eq, isNull } from 'drizzle-orm';
import { generateSecret, generateURI, verify } from 'otplib';
import qrcode from 'qrcode';
import crypto from 'node:crypto';

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

export const getTotpSetup = async (userId: string) => {
    const user = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.system, false)),
        columns: { email: true, totpSecretPending: true },
    });

    if (!user) throw new AppError('User not found', { statusCode: 404 });

    const secret = user.totpSecretPending ?? generateSecret();

    if (!user.totpSecretPending) {
        await db.update(users).set({ totpSecretPending: secret }).where(eq(users.id, userId));
    }

    const otpauth = generateURI({ issuer: 'DuckFlix', label: user.email, secret });
    const qrCodeUrl = await qrcode.toDataURL(otpauth);

    const manualKey = secret.match(/.{1,4}/g)?.join(' ') ?? secret;

    return { qrCodeUrl, manualKey };
};

export const cancelTotpSetup = async (userId: string) => {
    await db
        .update(users)
        .set({ totpSecretPending: null })
        .where(and(eq(users.id, userId), eq(users.system, false)));
};

export const activateTotp = async (userId: string, code: string) => {
    const user = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.system, false)),
        columns: { totpSecretPending: true },
    });

    if (!user?.totpSecretPending) {
        throw new AppError('No pending TOTP setup found', { statusCode: 400 });
    }

    const result = await verify({ token: code, secret: user.totpSecretPending });
    if (!result.valid) throw new AppError('Invalid code', { statusCode: 400 });

    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
    const hashedBackupCodes = await Promise.all(backupCodes.map((c) => argon2.hash(c)));

    await db.transaction(async (tx) => {
        await tx
            .update(users)
            .set({
                totpSecret: user.totpSecretPending,
                totpSecretPending: null,
                totpEnabled: true,
            })
            .where(eq(users.id, userId));

        await tx.delete(totpBackupCodes).where(eq(totpBackupCodes.userId, userId));
        await tx.insert(totpBackupCodes).values(hashedBackupCodes.map((hash) => ({ userId, codeHash: hash })));
    });

    await createAuditLog({
        actorUserId: userId,
        action: 'account.totp.activated',
        targetType: 'user',
        targetId: userId,
    });

    return { backupCodes };
};

export const deactivateTotp = async (userId: string) => {
    const [updated] = await db
        .update(users)
        .set({ totpEnabled: false, totpSecret: null, totpSecretPending: null })
        .where(and(eq(users.id, userId), eq(users.system, false)))
        .returning({ id: users.id });

    if (!updated) throw new AppError('User not found', { statusCode: 404 });

    await db.delete(totpBackupCodes).where(eq(totpBackupCodes.userId, userId));

    await createAuditLog({
        actorUserId: userId,
        action: 'account.totp.deactivated',
        targetType: 'user',
        targetId: userId,
    });
};
