import argon2 from 'argon2';
import crypto from 'node:crypto';
import { db } from '@shared/configs/db';
import { accountTokens, accountTotp, accounts, sessions, totpBackupCodes, type Account } from '@shared/schema';
import { libraries } from '@schema/library.schema';
import { and, eq, isNull } from 'drizzle-orm';
import {
    AuthTemporarilyLockedError,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    TooManyAuthAttemptsError,
    UserNotCreatedError,
} from './auth.errors';
import type { UserDTO } from '@duckflixapp/shared';
import { toUserDTO } from '@shared/mappers/user.mapper';
import { signToken, verifyToken } from '@utils/jwt';
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
import { parseDevice, type ClientHints } from '@shared/utils/device';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const generateOpaqueToken = () => crypto.randomBytes(32).toString('hex');
const hashOpaqueToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const getAuthMetadata = (context: { ip?: string; userAgent?: string }) => ({
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
});
const loginChallengeExpiryMs = 5 * 60 * 1000;

type AuthContext = { ip?: string; userAgent?: string; clientHints?: ClientHints };
type LoginChallengeMethod = 'totp' | 'backup_code';
type AuthenticatedSession = { token: string; refreshToken: string; user: UserDTO };
type LoginResult =
    | ({ requires2fa: false } & AuthenticatedSession)
    | {
          requires2fa: true;
          challengeToken: string;
          expiresIn: number;
          methods: LoginChallengeMethod[];
      };

const getLoginChallengeLimiterKey = (email: string) => `loginChallenge:${normalizeEmail(email)}`;

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

const getAccountTotp = async (accountId: string) => {
    const [totp] = await db.select().from(accountTotp).where(eq(accountTotp.accountId, accountId)).limit(1);
    return totp ?? null;
};

const withTotpStatus = async (account: Account) => {
    const totp = await getAccountTotp(account.id);
    return { ...account, totpEnabled: Boolean(totp?.enabled && totp.secret) };
};

const verifyTotpCredential = async (accountId: string, credential: string) => {
    const totp = await getAccountTotp(accountId);
    if (!totp?.secret || !totp.enabled) return false;

    const result = await verify({ token: credential, secret: totp.secret });
    return result.valid;
};

const verifyBackupCode = async (accountId: string, credential: string) => {
    const backupCodes = await db
        .select({ id: totpBackupCodes.id, codeHash: totpBackupCodes.codeHash })
        .from(totpBackupCodes)
        .where(and(eq(totpBackupCodes.accountId, accountId), isNull(totpBackupCodes.usedAt)));

    const normalizedCredential = credential.trim().toUpperCase();

    for (const backupCode of backupCodes) {
        if (!(await argon2.verify(backupCode.codeHash, normalizedCredential))) continue;

        const [used] = await db
            .update(totpBackupCodes)
            .set({ usedAt: new Date() })
            .where(and(eq(totpBackupCodes.id, backupCode.id), isNull(totpBackupCodes.usedAt)))
            .returning({ id: totpBackupCodes.id });

        return !!used;
    }

    return false;
};

const getLoginChallengeMethods = async (accountId: string): Promise<LoginChallengeMethod[]> => {
    const totp = await getAccountTotp(accountId);
    if (!totp?.enabled || !totp.secret) return [];

    const methods: LoginChallengeMethod[] = ['totp'];
    const [backupCode] = await db
        .select({ id: totpBackupCodes.id })
        .from(totpBackupCodes)
        .where(and(eq(totpBackupCodes.accountId, accountId), isNull(totpBackupCodes.usedAt)))
        .limit(1);

    if (backupCode) methods.push('backup_code');

    return methods;
};

const createLoginChallenge = async (accountId: string) => {
    const challengeToken = generateOpaqueToken();
    const challengeTokenHash = hashOpaqueToken(challengeToken);
    const expiresAt = new Date(Date.now() + loginChallengeExpiryMs).toISOString();

    await db.transaction(async (tx) => {
        await tx.delete(accountTokens).where(and(eq(accountTokens.accountId, accountId), eq(accountTokens.type, 'login_challenge')));
        await tx.insert(accountTokens).values({
            accountId,
            token: challengeTokenHash,
            type: 'login_challenge',
            expiresAt,
        });
    });

    return { challengeToken, expiresIn: loginChallengeExpiryMs };
};

const createAuthenticatedSession = async (
    account: Account,
    context: AuthContext,
    source: 'login' | 'loginChallenge'
): Promise<AuthenticatedSession> => {
    const refreshToken = generateOpaqueToken();
    const refreshTokenHash = hashOpaqueToken(refreshToken);
    const now = new Date().toISOString();
    const device = parseDevice({ userAgent: context.userAgent, clientHints: context.clientHints });

    const [session] = await db
        .insert(sessions)
        .values({
            accountId: account.id,
            token: refreshTokenHash,
            deviceName: device.deviceName,
            deviceType: device.deviceType,
            browserName: device.browserName,
            osName: device.osName,
            userAgent: context.userAgent,
            ipAddress: context.ip,
            lastIpAddress: context.ip,
            lastRefreshedAt: now,
            revokedAt: null,
            expiresAt: new Date(Date.now() + limits.authentication.session_expiry_ms).toISOString(),
        })
        .returning({ id: sessions.id });

    if (!session) throw new AppError('Session not created', { statusCode: 500 });

    const token = signToken({ sub: account.id, role: account.role, isVerified: account.verified_email, sid: session.id });

    await createAuditLog({
        actorUserId: account.id,
        action: 'session.created',
        targetType: 'session',
        targetId: session.id,
        metadata: {
            source,
            ...getAuthMetadata(context),
        },
    });
    await createAuditLog({
        actorUserId: account.id,
        action: 'auth.login.succeeded',
        targetType: 'user',
        targetId: account.id,
        metadata: {
            email: account.email,
            twoFactor: source === 'loginChallenge',
            ...getAuthMetadata(context),
        },
    });

    return { token, refreshToken, user: toUserDTO(await withTotpStatus(account)) };
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
    const verificationToken = generateOpaqueToken();
    const verificationTokenHash = hashOpaqueToken(verificationToken);

    try {
        const account = await db.transaction(async (tx) => {
            const existingAccount = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.system, false)).limit(1);

            const [account] = await tx
                .insert(accounts)
                .values({
                    name,
                    email: normalizedEmail,
                    password: hashedPassword,
                    verified_email: registration.trustEmails,
                    role: existingAccount.length === 0 ? 'admin' : 'watcher',
                })
                .returning()
                .catch((e) => {
                    if (isDuplicateKey(e)) throw new EmailAlreadyExistsError();
                    throw e;
                });
            if (!account) throw new UserNotCreatedError();

            // create initial libraries
            await tx.insert(libraries).values([
                {
                    accountId: account.id,
                    name: 'My Watchlist',
                    type: 'watchlist',
                },
            ]);

            if (!registration.trustEmails)
                await tx.insert(accountTokens).values({
                    accountId: account.id,
                    token: verificationTokenHash,
                    type: 'email_verification',
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                });

            return account;
        });

        authAttemptLimiter.resetRegister(normalizedEmail);

        if (!registration.trustEmails)
            await sendVerificationMail(account.name, account.email, verificationToken).catch((e) => {
                logger.error({ err: e, email: account.email }, 'Failed to send verification email');
            });

        await createAuditLog({
            actorUserId: account.id,
            action: 'auth.register.succeeded',
            targetType: 'user',
            targetId: account.id,
            metadata: {
                email: account.email,
                role: account.role,
                verifiedEmail: account.verified_email,
            },
        });

        return toUserDTO({ ...account, totpEnabled: false });
    } catch (error) {
        authAttemptLimiter.recordFailedRegister(normalizedEmail);
        throw error;
    }
};

export const verifyEmail = async (token: string) => {
    const tokenHash = hashOpaqueToken(token);
    const [storedToken] = await db
        .select()
        .from(accountTokens)
        .where(and(eq(accountTokens.token, tokenHash), eq(accountTokens.type, 'email_verification')));

    if (!storedToken || new Date() > new Date(storedToken.expiresAt)) {
        throw new AppError('Invalid or expired token', { statusCode: 400 });
    }

    const [account] = await db
        .select({ id: accounts.id, email: accounts.email })
        .from(accounts)
        .where(eq(accounts.id, storedToken.accountId));

    await db.transaction(async (tx) => {
        await tx.update(accounts).set({ verified_email: true }).where(eq(accounts.id, storedToken.accountId));

        await tx.delete(accountTokens).where(eq(accountTokens.id, storedToken.id));
    });

    await createAuditLog({
        actorUserId: storedToken.accountId,
        action: 'auth.email.verified',
        targetType: 'user',
        targetId: storedToken.accountId,
        metadata: {
            email: account?.email ?? null,
        },
    });
};

export const login = async (email: string, pass: string, context: AuthContext): Promise<LoginResult> => {
    const normalizedEmail = normalizeEmail(email);
    try {
        authAttemptLimiter.checkLogin(normalizedEmail);
    } catch (error) {
        if (error instanceof TooManyAuthAttemptsError || error instanceof AuthTemporarilyLockedError) {
            await auditAuthRateLimit('login', normalizedEmail, error);
        }
        throw error;
    }

    const [account] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.email, normalizedEmail), eq(accounts.system, false)))
        .limit(1);

    if (!account) {
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

    const isPasswordValid = await argon2.verify(account.password, pass);
    if (!isPasswordValid) {
        authAttemptLimiter.recordFailedLogin(normalizedEmail);
        await createAuditLog({
            actorUserId: account.id,
            action: 'auth.login.failed',
            targetType: 'user',
            targetId: account.id,
            metadata: {
                email: normalizedEmail,
                reason: 'invalid_password',
                ...getAuthMetadata(context),
            },
        });
        throw new InvalidCredentialsError();
    }

    authAttemptLimiter.resetLogin(normalizedEmail);

    const loginChallengeMethods = await getLoginChallengeMethods(account.id);
    if (loginChallengeMethods.length > 0) {
        const loginChallenge = await createLoginChallenge(account.id);

        await createAuditLog({
            actorUserId: account.id,
            action: 'auth.login.2fa_required',
            targetType: 'user',
            targetId: account.id,
            metadata: {
                email: normalizedEmail,
                methods: loginChallengeMethods,
                ...getAuthMetadata(context),
            },
        });

        return {
            requires2fa: true,
            ...loginChallenge,
            methods: loginChallengeMethods,
        };
    }

    const session = await createAuthenticatedSession(account, context, 'login');

    return { requires2fa: false, ...session };
};

export const verifyLoginChallenge = async (
    challengeToken: string,
    method: LoginChallengeMethod,
    credential: string,
    context: AuthContext
): Promise<AuthenticatedSession> => {
    const challengeTokenHash = hashOpaqueToken(challengeToken);
    const [storedToken] = await db
        .select()
        .from(accountTokens)
        .where(and(eq(accountTokens.token, challengeTokenHash), eq(accountTokens.type, 'login_challenge')))
        .limit(1);

    if (!storedToken) throw new AppError('Invalid or expired two-factor challenge', { statusCode: 401 });

    if (new Date() > new Date(storedToken.expiresAt)) {
        await db.delete(accountTokens).where(eq(accountTokens.id, storedToken.id));
        throw new AppError('Invalid or expired two-factor challenge', { statusCode: 401 });
    }

    const [account] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, storedToken.accountId), eq(accounts.system, false)))
        .limit(1);

    if (!account) {
        await db.delete(accountTokens).where(eq(accountTokens.id, storedToken.id));
        throw new AppError('Invalid or expired two-factor challenge', { statusCode: 401 });
    }

    const limiterKey = getLoginChallengeLimiterKey(account.email);
    try {
        authAttemptLimiter.checkLogin(limiterKey);
    } catch (error) {
        if (error instanceof TooManyAuthAttemptsError || error instanceof AuthTemporarilyLockedError) {
            await auditAuthRateLimit('login', account.email, error);
        }
        throw error;
    }

    const isValid = method === 'totp' ? await verifyTotpCredential(account.id, credential) : await verifyBackupCode(account.id, credential);

    if (!isValid) {
        authAttemptLimiter.recordFailedLogin(limiterKey);
        await createAuditLog({
            actorUserId: account.id,
            action: 'auth.login.2fa_failed',
            targetType: 'user',
            targetId: account.id,
            metadata: {
                email: account.email,
                method,
                ...getAuthMetadata(context),
            },
        });
        throw new AppError('Invalid authentication code', { statusCode: 401 });
    }

    await db.delete(accountTokens).where(eq(accountTokens.id, storedToken.id));
    authAttemptLimiter.resetLogin(limiterKey);

    if (method === 'backup_code') {
        await createAuditLog({
            actorUserId: account.id,
            action: 'auth.login.backup_code_used',
            targetType: 'user',
            targetId: account.id,
            metadata: getAuthMetadata(context),
        });
    }

    return createAuthenticatedSession(account, context, 'loginChallenge');
};

export const logout = async (data: { refreshToken?: string; accessToken?: string }) => {
    let session = data.refreshToken
        ? await db.query.sessions.findFirst({
              where: eq(sessions.token, hashOpaqueToken(data.refreshToken)),
          })
        : null;

    if (!session && data.accessToken) {
        try {
            const payload = verifyToken(data.accessToken, { ignoreExpiration: true });
            if (payload.sid) {
                session = await db.query.sessions.findFirst({
                    where: eq(sessions.id, payload.sid),
                });
            }
        } catch {
            session = null;
        }
    }

    if (!session) return;

    const revokedAt = session.revokedAt ?? new Date().toISOString();
    if (!session.revokedAt) {
        await db
            .update(sessions)
            .set({ revokedAt })
            .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)));
    }

    await createAuditLog({
        actorUserId: session.accountId,
        action: 'auth.logout',
        targetType: 'session',
        targetId: session.id,
        metadata: {
            ip: session.lastIpAddress ?? session.ipAddress ?? null,
            userAgent: session.userAgent ?? null,
        },
    });
};

export const refresh = async (oldToken: string, context: AuthContext) => {
    const oldTokenHash = hashOpaqueToken(oldToken);
    const session = await db.query.sessions.findFirst({
        where: eq(sessions.token, oldTokenHash),
    });

    if (!session) throw new AppError('Invalid refresh token', { statusCode: 401 });

    if (session.revokedAt !== null) {
        throw new ForbiddenError('Session has been revoked.');
    }

    if (new Date() > new Date(session.expiresAt)) {
        await db
            .update(sessions)
            .set({ revokedAt: new Date().toISOString() })
            .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)));
        await createAuditLog({
            actorUserId: session.accountId,
            action: 'auth.refresh.expired',
            targetType: 'session',
            targetId: session.id,
            metadata: {
                ip: context.ip ?? session.lastIpAddress ?? session.ipAddress ?? null,
                userAgent: context.userAgent ?? session.userAgent ?? null,
            },
        });
        throw new AppError('Session expired', { statusCode: 401 });
    }

    const [account] = await db.select().from(accounts).where(eq(accounts.id, session.accountId)).limit(1);

    if (!account) throw new AppError('User not found or deleted', { statusCode: 404 });

    const accessToken = signToken({
        sub: account.id,
        role: account.role,
        isVerified: account.verified_email,
        sid: session.id,
    });
    const refreshToken = generateOpaqueToken();
    const refreshTokenHash = hashOpaqueToken(refreshToken);
    const now = new Date().toISOString();
    const userAgent = context.userAgent ?? session.userAgent;
    const lastIpAddress = context.ip ?? session.lastIpAddress ?? session.ipAddress;
    const device = parseDevice({ userAgent, clientHints: context.clientHints });

    const [updatedSession] = await db
        .update(sessions)
        .set({
            token: refreshTokenHash,
            userAgent,
            deviceName: device.deviceName,
            deviceType: device.deviceType,
            browserName: device.browserName,
            osName: device.osName,
            lastIpAddress,
            lastRefreshedAt: now,
            expiresAt: new Date(Date.now() + limits.authentication.session_expiry_ms).toISOString(),
        })
        .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });

    if (!updatedSession) throw new ForbiddenError('Session has been revoked.');

    await createAuditLog({
        actorUserId: account.id,
        action: 'auth.refresh.succeeded',
        targetType: 'session',
        targetId: session.id,
        metadata: {
            previousSessionId: session.id,
            ip: context.ip ?? session.lastIpAddress ?? session.ipAddress ?? null,
            userAgent: userAgent ?? null,
        },
    });

    return {
        token: accessToken,
        refreshToken: refreshToken,
        user: toUserDTO(await withTotpStatus(account)),
    };
};

export const stepUp = async (
    accountId: string,
    scope: string,
    method: string,
    credential: string
): Promise<{ token: string; expiresIn: number }> => {
    const [account] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.system, false)))
        .limit(1);

    if (!account) throw new AppError('Failed to verify user', { statusCode: 401 });

    if (method === 'password') {
        const isValid = await argon2.verify(account.password, credential);
        if (!isValid) throw new AppError('Invalid password', { statusCode: 401 });
    } else if (method === 'totp') {
        const isValid = await verifyTotpCredential(account.id, credential);
        if (!isValid) throw new AppError('Invalid code', { statusCode: 401 });
    } else throw new AppError('Unsupported method', { statusCode: 400 });

    const expiresIn = 5 * 60 * 1000;
    const token = signToken({ sub: accountId, scope, stepUp: true }, expiresIn);

    await createAuditLog({
        actorUserId: accountId,
        action: 'auth.step_up.succeeded',
        targetType: 'user',
        targetId: accountId,
        metadata: { scope, method },
    });

    return { token, expiresIn };
};

export const getVerificationMethods = async (accountId: string): Promise<string[]> => {
    const [account] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.system, false)))
        .limit(1);

    if (!account) throw new AppError('Failed to verify user', { statusCode: 401 });

    const methods: string[] = [];
    const totp = await getAccountTotp(account.id);

    if (!!account.password) methods.push('password');
    if (totp?.enabled && !!totp.secret) methods.push('totp');

    return methods;
};
