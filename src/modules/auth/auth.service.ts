import argon2 from 'argon2';
import crypto from 'node:crypto';
import { db } from '@shared/configs/db';
import { accountTokens, sessions, users } from '@shared/schema';
import { libraries } from '@schema/library.schema';
import { and, eq } from 'drizzle-orm';
import {
    AuthTemporarilyLockedError,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    TooManyAuthAttemptsError,
    UserNotCreatedError,
} from './auth.errors';
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
import { verify } from 'otplib';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const getAuthMetadata = (context: { ip?: string; userAgent?: string }) => ({
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
});

const auditAuthRateLimit = async (
    scope: 'login' | 'register',
    email: string,
    error: TooManyAuthAttemptsError | AuthTemporarilyLockedError
) => {
    await createAuditLog({
        action: `auth.${scope}.rate_limited`,
        targetType: 'auth_attempt',
        metadata: {
            email,
            retryAfterSeconds:
                typeof error.details === 'object' && error.details && 'retryAfterSeconds' in error.details
                    ? error.details.retryAfterSeconds
                    : null,
        },
    });
};

export const register = async (name: string, email: string, pass: string): Promise<UserDTO> => {
    const normalizedEmail = normalizeEmail(email);
    try {
        authAttemptLimiter.checkRegister(normalizedEmail);
    } catch (error) {
        if (error instanceof TooManyAuthAttemptsError || error instanceof AuthTemporarilyLockedError) {
            await auditAuthRateLimit('register', normalizedEmail, error);
        }
        throw error;
    }

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
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                });

            return user;
        });

        authAttemptLimiter.resetRegister(normalizedEmail);

        if (!registration.trustEmails)
            await sendVerificationMail(user.name, user.email, verificationToken).catch((e) => {
                logger.error({ err: e, email: user.email }, 'Failed to send verification email');
            });

        await createAuditLog({
            actorUserId: user.id,
            action: 'auth.register.succeeded',
            targetType: 'user',
            targetId: user.id,
            metadata: {
                email: user.email,
                role: user.role,
                verifiedEmail: user.verified_email,
            },
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

    if (!storedToken || new Date() > new Date(storedToken.expiresAt)) {
        throw new AppError('Invalid or expired token', { statusCode: 400 });
    }

    const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, storedToken.userId));

    await db.transaction(async (tx) => {
        await tx.update(users).set({ verified_email: true }).where(eq(users.id, storedToken.userId));

        await tx.delete(accountTokens).where(eq(accountTokens.id, storedToken.id));
    });

    await createAuditLog({
        actorUserId: storedToken.userId,
        action: 'auth.email.verified',
        targetType: 'user',
        targetId: storedToken.userId,
        metadata: {
            email: user?.email ?? null,
        },
    });
};

export const login = async (
    email: string,
    pass: string,
    context: { ip?: string; userAgent?: string }
): Promise<{ token: string; refreshToken: string; user: UserDTO }> => {
    const normalizedEmail = normalizeEmail(email);
    try {
        authAttemptLimiter.checkLogin(normalizedEmail);
    } catch (error) {
        if (error instanceof TooManyAuthAttemptsError || error instanceof AuthTemporarilyLockedError) {
            await auditAuthRateLimit('login', normalizedEmail, error);
        }
        throw error;
    }

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
    let sessionId = '';

    const [session] = await db
        .insert(sessions)
        .values({
            userId: user.id,
            token: refreshToken,
            ipAddress: context.ip,
            userAgent: context.userAgent,
            expiresAt: new Date(Date.now() + limits.authentication.session_expiry_ms).toISOString(),
        })
        .returning({ id: sessions.id });

    if (session) sessionId = session.id;

    authAttemptLimiter.resetLogin(normalizedEmail);
    await createAuditLog({
        actorUserId: user.id,
        action: 'session.created',
        targetType: 'session',
        targetId: sessionId || null,
        metadata: {
            source: 'login',
            ...getAuthMetadata(context),
        },
    });
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

    if (new Date() > new Date(session.expiresAt)) {
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
                expiresAt: new Date(Date.now() + limits.authentication.session_expiry_ms).toISOString(),
                userAgent: session.userAgent,
                ipAddress: session.ipAddress,
            })
            .returning({ id: sessions.id });

        if (newSession) newSessionId = newSession.id;
    });

    await createAuditLog({
        actorUserId: user.id,
        action: 'session.created',
        targetType: 'session',
        targetId: newSessionId || session.id,
        metadata: {
            source: 'refresh',
            previousSessionId: session.id,
            ip: session.ipAddress ?? null,
            userAgent: session.userAgent ?? null,
        },
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

export const stepUp = async (
    userId: string,
    scope: string,
    method: string,
    credential: string
): Promise<{ token: string; expiresIn: number }> => {
    const user = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.system, false)),
    });

    if (!user) throw new AppError('Failed to verify user', { statusCode: 401 });

    if (method === 'password') {
        const isValid = await argon2.verify(user.password, credential);
        if (!isValid) throw new AppError('Invalid password', { statusCode: 401 });
    } else if (method === 'totp') {
        if (!user.totpSecret || !user.totpEnabled) throw new AppError('TOTP not configured', { statusCode: 400 });

        const result = await verify({ token: credential, secret: user.totpSecret });
        if (!result.valid) throw new AppError('Invalid code', { statusCode: 401 });
    } else throw new AppError('Unsupported method', { statusCode: 400 });

    const expiresIn = 5 * 60 * 1000;
    const token = signToken({ sub: userId, scope, stepUp: true }, expiresIn);

    await createAuditLog({
        actorUserId: userId,
        action: 'auth.step_up.succeeded',
        targetType: 'user',
        targetId: userId,
        metadata: { scope, method },
    });

    return { token, expiresIn };
};

export const getVerificationMethods = async (userId: string): Promise<string[]> => {
    const user = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.system, false)),
    });

    if (!user) throw new AppError('Failed to verify user', { statusCode: 401 });

    const methods: string[] = [];

    if (!!user.password) methods.push('password');
    if (user.totpEnabled && !!user.totpSecret) methods.push('totp');

    return methods;
};
