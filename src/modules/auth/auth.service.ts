import argon2 from 'argon2';
import crypto from 'node:crypto';
import { db } from '@shared/configs/db';
import { accountTokens, sessions, users } from '@shared/schema';
import { libraries } from '@schema/library.schema';
import { and, eq } from 'drizzle-orm';
import { EmailAlreadyExistsError, InvalidCredentialsError, UserNotCreatedError } from './auth.errors';
import type { UserDTO } from '@duckflixapp/shared';
import { toUserDTO } from '@shared/mappers/user.mapper';
import { signToken } from '@utils/jwt';
import { AppError } from '@shared/errors';
import { ForbiddenError } from '@shared/middlewares/auth.middleware';
import { limits } from '@shared/configs/limits.config';
import { sendVerificationMail } from '@shared/services/mailer.service';
import { systemSettings } from '@shared/services/system.service';
import { logger } from '@shared/configs/logger';
import { isDuplicateKey } from '@shared/db.errors';
import { authAttemptLimiter } from './auth-attempt-limiter';
import { createAuditLog } from '@shared/services/audit.service';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const getAuthMetadata = (context: { ip?: string; userAgent?: string }) => ({
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
});

export const register = async (name: string, email: string, pass: string): Promise<UserDTO> => {
    const normalizedEmail = normalizeEmail(email);
    authAttemptLimiter.checkRegister(normalizedEmail);

    const sysSettings = await systemSettings.get();
    const registration = sysSettings.features.registration;

    if (!registration.enabled)
        throw new AppError('Registration is disabled. Please contact the system administrator.', { statusCode: 503 });

    if (!registration.trustEmails && !sysSettings.external.email.enabled)
        throw new AppError(
            'You tried to register but account cannot be verified because you disabled email service and trust emails feature.',
            { statusCode: 503 }
        );

    const hashedPassword = await argon2.hash(pass);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    try {
        const user = await db.transaction(async (tx) => {
            const existingUser = await tx.select({ id: users.id }).from(users).where(eq(users.system, false)).limit(1);

            const [user] = await tx
                .insert(users)
                .values({
                    name,
                    email: normalizedEmail,
                    password: hashedPassword,
                    verified_email: registration.trustEmails,
                    role: existingUser.length === 0 ? 'admin' : 'watcher',
                })
                .returning()
                .catch((e) => {
                    if (isDuplicateKey(e)) throw new EmailAlreadyExistsError();
                    throw e;
                });
            if (!user) throw new UserNotCreatedError();

            // create initial libraries
            await tx.insert(libraries).values([
                {
                    userId: user.id,
                    name: 'My Watchlist',
                    type: 'watchlist',
                },
            ]);

            if (!registration.trustEmails)
                await tx.insert(accountTokens).values({
                    userId: user.id,
                    token: verificationToken,
                    type: 'email_verification',
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                });

            return user;
        });

        authAttemptLimiter.resetRegister(normalizedEmail);

        if (!registration.trustEmails)
            await sendVerificationMail(user.name, user.email, verificationToken).catch((e) => {
                logger.error({ err: e, email: user.email }, 'Failed to send verification email');
            });

        return toUserDTO(user);
    } catch (error) {
        authAttemptLimiter.recordFailedRegister(normalizedEmail);
        throw error;
    }
};

export const verifyEmail = async (token: string) => {
    const [storedToken] = await db
        .select()
        .from(accountTokens)
        .where(and(eq(accountTokens.token, token), eq(accountTokens.type, 'email_verification')));

    if (!storedToken || new Date() > storedToken.expiresAt) {
        throw new AppError('Invalid or expired token', { statusCode: 400 });
    }

    await db.transaction(async (tx) => {
        await tx.update(users).set({ verified_email: true }).where(eq(users.id, storedToken.userId));

        await tx.delete(accountTokens).where(eq(accountTokens.id, storedToken.id));
    });
};

export const login = async (
    email: string,
    pass: string,
    context: { ip?: string; userAgent?: string }
): Promise<{ token: string; refreshToken: string; user: UserDTO }> => {
    const normalizedEmail = normalizeEmail(email);
    authAttemptLimiter.checkLogin(normalizedEmail);

    const user = await db.query.users.findFirst({ where: and(eq(users.email, normalizedEmail), eq(users.system, false)) });

    if (!user) {
        authAttemptLimiter.recordFailedLogin(normalizedEmail);
        await createAuditLog({
            action: 'auth.login.failed',
            targetType: 'user',
            metadata: {
                email: normalizedEmail,
                reason: 'user_not_found',
                ...getAuthMetadata(context),
            },
        });
        throw new InvalidCredentialsError();
    }

    const isPasswordValid = await argon2.verify(user.password, pass);
    if (!isPasswordValid) {
        authAttemptLimiter.recordFailedLogin(normalizedEmail);
        await createAuditLog({
            actorUserId: user.id,
            action: 'auth.login.failed',
            targetType: 'user',
            targetId: user.id,
            metadata: {
                email: normalizedEmail,
                reason: 'invalid_password',
                ...getAuthMetadata(context),
            },
        });
        throw new InvalidCredentialsError();
    }

    const token = signToken({ sub: user.id, role: user.role, isVerified: user.verified_email });
    const refreshToken = crypto.randomUUID();

    await db.insert(sessions).values({
        userId: user.id,
        token: refreshToken,
        ipAddress: context.ip,
        userAgent: context.userAgent,
        expiresAt: new Date(Date.now() + limits.authentication.session_expiry_ms),
    });

    authAttemptLimiter.resetLogin(normalizedEmail);
    await createAuditLog({
        actorUserId: user.id,
        action: 'auth.login.succeeded',
        targetType: 'user',
        targetId: user.id,
        metadata: {
            email: normalizedEmail,
            ...getAuthMetadata(context),
        },
    });

    return { token, refreshToken, user: toUserDTO(user) };
};

export const logout = async (refreshToken: string) => {
    const session = await db.query.sessions.findFirst({
        where: eq(sessions.token, refreshToken),
    });

    await db.delete(sessions).where(eq(sessions.token, refreshToken));

    if (!session) return;

    await createAuditLog({
        actorUserId: session.userId,
        action: 'auth.logout',
        targetType: 'session',
        targetId: session.id,
        metadata: {
            ip: session.ipAddress ?? null,
            userAgent: session.userAgent ?? null,
        },
    });
};

export const refresh = async (oldToken: string) => {
    const session = await db.query.sessions.findFirst({
        where: eq(sessions.token, oldToken),
    });

    if (!session) throw new AppError('Invalid refresh token', { statusCode: 401 });

    if (session.isUsed) {
        await db.delete(sessions).where(eq(sessions.userId, session.userId));
        await createAuditLog({
            actorUserId: session.userId,
            action: 'auth.refresh.reuse_detected',
            targetType: 'session',
            targetId: session.id,
            metadata: {
                ip: session.ipAddress ?? null,
                userAgent: session.userAgent ?? null,
            },
        });
        throw new ForbiddenError('Security breach detected. All sessions invalidated.');
    }

    if (new Date() > session.expiresAt) {
        await db.delete(sessions).where(eq(sessions.id, session.id));
        await createAuditLog({
            actorUserId: session.userId,
            action: 'auth.refresh.expired',
            targetType: 'session',
            targetId: session.id,
            metadata: {
                ip: session.ipAddress ?? null,
                userAgent: session.userAgent ?? null,
            },
        });
        throw new AppError('Session expired', { statusCode: 401 });
    }

    const user = await db.query.users.findFirst({
        where: eq(users.id, session.userId),
    });

    if (!user) throw new AppError('User not found or deleted', { statusCode: 404 });

    const accessToken = signToken({
        sub: user.id,
        role: user.role,
        isVerified: user.verified_email,
    });
    const refreshToken = crypto.randomUUID();
    let newSessionId = '';

    await db.transaction(async (tx) => {
        await tx.update(sessions).set({ isUsed: true }).where(eq(sessions.id, session.id));
        const [newSession] = await tx
            .insert(sessions)
            .values({
                userId: user.id,
                token: refreshToken,
                expiresAt: new Date(Date.now() + limits.authentication.session_expiry_ms),
                userAgent: session.userAgent,
                ipAddress: session.ipAddress,
            })
            .returning({ id: sessions.id });

        if (newSession) newSessionId = newSession.id;
    });

    await createAuditLog({
        actorUserId: user.id,
        action: 'auth.refresh.succeeded',
        targetType: 'session',
        targetId: newSessionId || session.id,
        metadata: {
            previousSessionId: session.id,
            ip: session.ipAddress ?? null,
            userAgent: session.userAgent ?? null,
        },
    });

    return {
        token: accessToken,
        refreshToken: refreshToken,
        user: toUserDTO(user),
    };
};
