import type { AccountDTO } from '@duckflixapp/shared';

import { limits } from '@shared/configs/limits.config';
import { AppError } from '@shared/errors';
import { toAccountDTO } from '@shared/mappers/user.mapper';
import { ForbiddenError } from '@shared/middlewares/auth.middleware';
import {
    AuthTemporarilyLockedError,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    TooManyAuthAttemptsError,
    UserNotCreatedError,
} from './auth.errors';
import {
    AuthAccountCreateFailedError,
    DuplicateAuthEmailError,
    type AuthAccountRecord,
    type AuthAccountWithStatus,
    type AuthAttemptLimiterPort,
    type AuthAuditLogger,
    type AuthContext,
    type AuthDeviceParser,
    type AuthenticatedSession,
    type AuthLogger,
    type AuthOpaqueTokenService,
    type AuthPasswordHasher,
    type AuthRepository,
    type AuthSystemSettingsProvider,
    type AuthTokenService,
    type AuthTotpVerifier,
    type AuthVerificationMailer,
    type LoginChallengeMethod,
    type LoginResult,
} from './auth.ports';

type AuthServiceDependencies = {
    authRepository: AuthRepository;
    passwordHasher: AuthPasswordHasher;
    opaqueTokenService: AuthOpaqueTokenService;
    tokenService: AuthTokenService;
    totpVerifier: AuthTotpVerifier;
    systemSettingsProvider: AuthSystemSettingsProvider;
    verificationMailer: AuthVerificationMailer;
    auditLogger: AuthAuditLogger;
    logger: AuthLogger;
    authAttemptLimiter: AuthAttemptLimiterPort;
    deviceParser: AuthDeviceParser;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const getAuthMetadata = (context: { ip?: string; userAgent?: string }) => ({
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
});
const loginChallengeExpiryMs = 5 * 60 * 1000;

const getLoginChallengeLimiterKey = (email: string) => `loginChallenge:${normalizeEmail(email)}`;

const toAccountDTOWithStatus = (account: AuthAccountWithStatus): AccountDTO => {
    const { isVerified, ...accountData } = account;
    return toAccountDTO({ ...accountData, verified_email: isVerified });
};

export const createAuthService = ({
    authRepository,
    passwordHasher,
    opaqueTokenService,
    tokenService,
    totpVerifier,
    systemSettingsProvider,
    verificationMailer,
    auditLogger,
    logger,
    authAttemptLimiter,
    deviceParser,
}: AuthServiceDependencies) => {
    const auditAuthRateLimit = async (
        scope: 'login' | 'register',
        email: string,
        error: TooManyAuthAttemptsError | AuthTemporarilyLockedError
    ) => {
        await auditLogger.createAuditLog({
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

    const withTotpStatus = async (account: AuthAccountRecord): Promise<AuthAccountWithStatus> => {
        const [totp, profile] = await Promise.all([authRepository.getAccountTotp(account.id), authRepository.findFirstProfile(account.id)]);

        return { ...account, profiles: profile ? [profile] : [], totpEnabled: Boolean(totp?.enabled && totp.secret) };
    };

    const verifyTotpCredential = async (accountId: string, credential: string) => {
        const totp = await authRepository.getAccountTotp(accountId);
        if (!totp?.secret || !totp.enabled) return false;

        return totpVerifier.verify({ token: credential, secret: totp.secret });
    };

    const verifyBackupCode = async (accountId: string, credential: string) => {
        const backupCodes = await authRepository.listUnusedBackupCodes(accountId);
        const normalizedCredential = credential.trim().toUpperCase();

        for (const backupCode of backupCodes) {
            if (!(await passwordHasher.verify(backupCode.codeHash, normalizedCredential))) continue;

            return authRepository.markBackupCodeUsed({ backupCodeId: backupCode.id, usedAt: new Date() });
        }

        return false;
    };

    const getLoginChallengeMethods = async (accountId: string): Promise<LoginChallengeMethod[]> => {
        const totp = await authRepository.getAccountTotp(accountId);
        if (!totp?.enabled || !totp.secret) return [];

        const methods: LoginChallengeMethod[] = ['totp'];
        if (await authRepository.hasUnusedBackupCode(accountId)) methods.push('backup_code');

        return methods;
    };

    const createLoginChallenge = async (accountId: string) => {
        const challengeToken = opaqueTokenService.generate();
        const challengeTokenHash = opaqueTokenService.hash(challengeToken);
        const expiresAt = new Date(Date.now() + loginChallengeExpiryMs).toISOString();

        await authRepository.createLoginChallenge({ accountId, tokenHash: challengeTokenHash, expiresAt });

        return { challengeToken, expiresIn: loginChallengeExpiryMs };
    };

    const getSelectedProfileIdFromAccessToken = async (accessToken: string | undefined, session: { id: string; accountId: string }) => {
        if (!accessToken) return undefined;

        try {
            const payload = tokenService.verifyAccessToken(accessToken, { ignoreExpiration: true });
            if (payload.sub !== session.accountId || payload.sid !== session.id || !payload.profileId) return undefined;

            return (
                (await authRepository.findProfileIdForAccount({
                    accountId: session.accountId,
                    profileId: payload.profileId,
                })) ?? undefined
            );
        } catch {
            return undefined;
        }
    };

    const createAuthenticatedSession = async (
        account: AuthAccountRecord,
        context: AuthContext,
        source: 'login' | 'loginChallenge' | 'register'
    ): Promise<AuthenticatedSession> => {
        const refreshToken = opaqueTokenService.generate();
        const refreshTokenHash = opaqueTokenService.hash(refreshToken);
        const now = new Date().toISOString();
        const device = deviceParser.parse({ userAgent: context.userAgent, clientHints: context.clientHints });
        const sessionId = await authRepository.createSession({
            accountId: account.id,
            refreshTokenHash,
            device,
            userAgent: context.userAgent,
            ip: context.ip,
            now,
            expiresAt: new Date(Date.now() + limits.authentication.session_expiry_ms).toISOString(),
        });

        if (!sessionId) throw new AppError('Session not created', { statusCode: 500 });

        const token = tokenService.signAccessToken({
            sub: account.id,
            role: account.role,
            isVerified: account.isVerified,
            sid: sessionId,
        });

        await auditLogger.createAuditLog({
            actorAccountId: account.id,
            action: 'session.created',
            targetType: 'session',
            targetId: sessionId,
            metadata: {
                source,
                ...getAuthMetadata(context),
            },
        });
        await auditLogger.createAuditLog({
            actorAccountId: account.id,
            action: 'auth.login.succeeded',
            targetType: 'user',
            targetId: account.id,
            metadata: {
                email: account.email,
                twoFactor: source === 'loginChallenge',
                ...getAuthMetadata(context),
            },
        });

        return { token, refreshToken, user: toAccountDTOWithStatus(await withTotpStatus(account)) };
    };

    const register = async (email: string, pass: string, context: AuthContext): Promise<AuthenticatedSession> => {
        const normalizedEmail = normalizeEmail(email);
        try {
            authAttemptLimiter.checkRegister(normalizedEmail);
        } catch (error) {
            if (error instanceof TooManyAuthAttemptsError || error instanceof AuthTemporarilyLockedError) {
                await auditAuthRateLimit('register', normalizedEmail, error);
            }
            throw error;
        }

        const sysSettings = await systemSettingsProvider.get();
        const registration = sysSettings.features.registration;

        if (!registration.enabled)
            throw new AppError('Registration is disabled. Please contact the system administrator.', { statusCode: 503 });

        if (!registration.trustEmails && !sysSettings.external.email.enabled)
            throw new AppError(
                'You tried to register but account cannot be verified because you disabled email service and trust emails feature.',
                { statusCode: 503 }
            );

        const hashedPassword = await passwordHasher.hash(pass);
        const verificationToken = opaqueTokenService.generate();
        const verificationTokenHash = opaqueTokenService.hash(verificationToken);

        try {
            const account = await authRepository.createAccountWithVerificationToken({
                email: normalizedEmail,
                passwordHash: hashedPassword,
                isVerified: registration.trustEmails,
                firstAccountRole: 'admin',
                defaultRole: 'watcher',
                verificationTokenHash: registration.trustEmails ? undefined : verificationTokenHash,
                verificationTokenExpiresAt: registration.trustEmails ? undefined : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            });

            authAttemptLimiter.resetRegister(normalizedEmail);

            if (!registration.trustEmails)
                await verificationMailer.sendVerificationMail(account.email, account.email, verificationToken).catch((error) => {
                    logger.error({ err: error, email: account.email }, 'Failed to send verification email');
                });

            await auditLogger.createAuditLog({
                actorAccountId: account.id,
                action: 'auth.register.succeeded',
                targetType: 'user',
                targetId: account.id,
                metadata: {
                    email: account.email,
                    role: account.role,
                    verifiedEmail: account.isVerified,
                },
            });

            return createAuthenticatedSession(account, context, 'register');
        } catch (error) {
            authAttemptLimiter.recordFailedRegister(normalizedEmail);
            if (error instanceof DuplicateAuthEmailError) throw new EmailAlreadyExistsError();
            if (error instanceof AuthAccountCreateFailedError) throw new UserNotCreatedError();
            throw error;
        }
    };

    const verifyEmail = async (token: string) => {
        const tokenHash = opaqueTokenService.hash(token);
        const storedToken = await authRepository.findAccountTokenByHash({ tokenHash, type: 'email_verification' });

        if (!storedToken || new Date() > new Date(storedToken.expiresAt)) {
            throw new AppError('Invalid or expired token', { statusCode: 400 });
        }

        const account = await authRepository.findAccountEmail(storedToken.accountId);
        await authRepository.verifyEmailToken({ accountId: storedToken.accountId, tokenId: storedToken.id });

        await auditLogger.createAuditLog({
            actorAccountId: storedToken.accountId,
            action: 'auth.email.verified',
            targetType: 'user',
            targetId: storedToken.accountId,
            metadata: {
                email: account?.email ?? null,
            },
        });
    };

    const login = async (email: string, pass: string, context: AuthContext): Promise<LoginResult> => {
        const normalizedEmail = normalizeEmail(email);
        try {
            authAttemptLimiter.checkLogin(normalizedEmail);
        } catch (error) {
            if (error instanceof TooManyAuthAttemptsError || error instanceof AuthTemporarilyLockedError) {
                await auditAuthRateLimit('login', normalizedEmail, error);
            }
            throw error;
        }

        const account = await authRepository.findAccountByEmail(normalizedEmail);

        if (!account) {
            authAttemptLimiter.recordFailedLogin(normalizedEmail);
            await auditLogger.createAuditLog({
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

        const isPasswordValid = await passwordHasher.verify(account.password, pass);
        if (!isPasswordValid) {
            authAttemptLimiter.recordFailedLogin(normalizedEmail);
            await auditLogger.createAuditLog({
                actorAccountId: account.id,
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

            await auditLogger.createAuditLog({
                actorAccountId: account.id,
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

    const verifyLoginChallenge = async (
        challengeToken: string,
        method: LoginChallengeMethod,
        credential: string,
        context: AuthContext
    ): Promise<AuthenticatedSession> => {
        const challengeTokenHash = opaqueTokenService.hash(challengeToken);
        const storedToken = await authRepository.findAccountTokenByHash({
            tokenHash: challengeTokenHash,
            type: 'login_challenge',
        });

        if (!storedToken) throw new AppError('Invalid or expired two-factor challenge', { statusCode: 401 });

        if (new Date() > new Date(storedToken.expiresAt)) {
            await authRepository.deleteAccountToken(storedToken.id);
            throw new AppError('Invalid or expired two-factor challenge', { statusCode: 401 });
        }

        const account = await authRepository.findUserAccountById(storedToken.accountId);

        if (!account) {
            await authRepository.deleteAccountToken(storedToken.id);
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

        const isValid =
            method === 'totp' ? await verifyTotpCredential(account.id, credential) : await verifyBackupCode(account.id, credential);

        if (!isValid) {
            authAttemptLimiter.recordFailedLogin(limiterKey);
            await auditLogger.createAuditLog({
                actorAccountId: account.id,
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

        await authRepository.deleteAccountToken(storedToken.id);
        authAttemptLimiter.resetLogin(limiterKey);

        if (method === 'backup_code') {
            await auditLogger.createAuditLog({
                actorAccountId: account.id,
                action: 'auth.login.backup_code_used',
                targetType: 'user',
                targetId: account.id,
                metadata: getAuthMetadata(context),
            });
        }

        return createAuthenticatedSession(account, context, 'loginChallenge');
    };

    const logout = async (data: { refreshToken?: string; accessToken?: string }) => {
        let session = data.refreshToken ? await authRepository.findSessionByTokenHash(opaqueTokenService.hash(data.refreshToken)) : null;

        if (!session && data.accessToken) {
            try {
                const payload = tokenService.verifyAccessToken(data.accessToken, { ignoreExpiration: true });
                if (payload.sid) {
                    session = await authRepository.findSessionById(payload.sid);
                }
            } catch {
                session = null;
            }
        }

        if (!session) return;

        const revokedAt = session.revokedAt ?? new Date().toISOString();
        if (!session.revokedAt) {
            await authRepository.revokeSessionIfActive({ sessionId: session.id, revokedAt });
        }

        await auditLogger.createAuditLog({
            actorAccountId: session.accountId,
            action: 'auth.logout',
            targetType: 'session',
            targetId: session.id,
            metadata: {
                ip: session.lastIpAddress ?? session.ipAddress ?? null,
                userAgent: session.userAgent ?? null,
            },
        });
    };

    const refresh = async (oldToken: string, context: AuthContext, oldAccessToken?: string) => {
        const oldTokenHash = opaqueTokenService.hash(oldToken);
        const session = await authRepository.findSessionByTokenHash(oldTokenHash);

        if (!session) throw new AppError('Invalid refresh token', { statusCode: 401 });

        if (session.revokedAt !== null) {
            throw new ForbiddenError('Session has been revoked.');
        }

        if (new Date() > new Date(session.expiresAt)) {
            await authRepository.revokeSessionIfActive({ sessionId: session.id, revokedAt: new Date().toISOString() });
            await auditLogger.createAuditLog({
                actorAccountId: session.accountId,
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

        const account = await authRepository.findAccountById(session.accountId);

        if (!account) throw new AppError('User not found or deleted', { statusCode: 404 });
        const profileId = await getSelectedProfileIdFromAccessToken(oldAccessToken, session);

        const accessToken = tokenService.signAccessToken({
            sub: account.id,
            role: account.role,
            isVerified: account.isVerified,
            sid: session.id,
            profileId,
        });
        const refreshToken = opaqueTokenService.generate();
        const refreshTokenHash = opaqueTokenService.hash(refreshToken);
        const now = new Date().toISOString();
        const userAgent = context.userAgent ?? session.userAgent;
        const lastIpAddress = context.ip ?? session.lastIpAddress ?? session.ipAddress;
        const device = deviceParser.parse({ userAgent, clientHints: context.clientHints });

        const updatedSession = await authRepository.refreshSession({
            sessionId: session.id,
            refreshTokenHash,
            userAgent,
            device,
            lastIpAddress,
            refreshedAt: now,
            expiresAt: new Date(Date.now() + limits.authentication.session_expiry_ms).toISOString(),
        });

        if (!updatedSession) throw new ForbiddenError('Session has been revoked.');

        await auditLogger.createAuditLog({
            actorAccountId: account.id,
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
            user: toAccountDTOWithStatus(await withTotpStatus(account)),
        };
    };

    const stepUp = async (
        accountId: string,
        scope: string,
        method: string,
        credential: string
    ): Promise<{ token: string; expiresIn: number }> => {
        const account = await authRepository.findUserAccountById(accountId);

        if (!account) throw new AppError('Failed to verify user', { statusCode: 401 });

        if (method === 'password') {
            const isValid = await passwordHasher.verify(account.password, credential);
            if (!isValid) throw new AppError('Invalid password', { statusCode: 401 });
        } else if (method === 'totp') {
            const isValid = await verifyTotpCredential(account.id, credential);
            if (!isValid) throw new AppError('Invalid code', { statusCode: 401 });
        } else throw new AppError('Unsupported method', { statusCode: 400 });

        const expiresIn = 5 * 60 * 1000;
        const token = tokenService.signStepUpToken({ sub: accountId, scope, stepUp: true }, expiresIn);

        await auditLogger.createAuditLog({
            actorAccountId: accountId,
            action: 'auth.step_up.succeeded',
            targetType: 'user',
            targetId: accountId,
            metadata: { scope, method },
        });

        return { token, expiresIn };
    };

    const getVerificationMethods = async (accountId: string): Promise<string[]> => {
        const account = await authRepository.findUserAccountById(accountId);

        if (!account) throw new AppError('Failed to verify user', { statusCode: 401 });

        const methods: string[] = [];
        const totp = await authRepository.getAccountTotp(account.id);

        if (!!account.password) methods.push('password');
        if (totp?.enabled && !!totp.secret) methods.push('totp');

        return methods;
    };

    return {
        getVerificationMethods,
        login,
        logout,
        refresh,
        register,
        stepUp,
        verifyEmail,
        verifyLoginChallenge,
    };
};

export type AuthService = ReturnType<typeof createAuthService>;
