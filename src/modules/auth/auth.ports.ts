import type { AccountDTO, UserRole } from '@duckflixapp/shared';
import type { SystemSettingsT } from '@schema/system.schema';
import type { ClientHints, ParsedDevice } from '@shared/utils/device';
import type { AuthTemporarilyLockedError, TooManyAuthAttemptsError } from './auth.errors';

export type AuthContext = { ip?: string; userAgent?: string; clientHints?: ClientHints };
export type LoginChallengeMethod = 'totp' | 'backup_code';
export type AuthenticatedSession = { token: string; refreshToken: string; user: AccountDTO };
export type LoginResult =
    | ({ requires2fa: false } & AuthenticatedSession)
    | {
          requires2fa: true;
          challengeToken: string;
          expiresIn: number;
          methods: LoginChallengeMethod[];
      };

export type AuthAccountRecord = {
    id: string;
    email: string;
    isVerified: boolean;
    password: string;
    role: UserRole;
    system: boolean;
    createdAt: string;
};

export type AuthProfileRecord = {
    id: string;
    accountId: string;
    name: string;
    pinHash: string | null;
    createdAt: string;
};

export type AuthAccountWithStatus = AuthAccountRecord & {
    profiles: AuthProfileRecord[];
    totpEnabled: boolean;
};

export type AuthTotpRecord = {
    accountId: string;
    secret: string | null;
    pendingSecret: string | null;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
};

export type AuthBackupCodeRecord = {
    id: string;
    codeHash: string;
};

export type AuthAccountTokenType = 'email_verification' | 'login_challenge';

export type AuthAccountTokenRecord = {
    id: string;
    accountId: string;
    token: string;
    type: AuthAccountTokenType;
    expiresAt: string;
};

export type AuthSessionRecord = {
    id: string;
    accountId: string;
    token: string;
    userAgent: string | null;
    deviceName: string | null;
    deviceType: string | null;
    browserName: string | null;
    osName: string | null;
    ipAddress: string | null;
    lastIpAddress: string | null;
    lastRefreshedAt: string | null;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
};

export type CreateAccountWithVerificationTokenInput = {
    email: string;
    passwordHash: string;
    isVerified: boolean;
    firstAccountRole: UserRole;
    defaultRole: UserRole;
    verificationTokenHash?: string;
    verificationTokenExpiresAt?: string;
};

export type CreateSessionInput = {
    accountId: string;
    refreshTokenHash: string;
    device: ParsedDevice;
    userAgent?: string;
    ip?: string;
    now: string;
    expiresAt: string;
};

export type RefreshSessionInput = {
    sessionId: string;
    refreshTokenHash: string;
    device: ParsedDevice;
    userAgent?: string | null;
    lastIpAddress?: string | null;
    refreshedAt: string;
    expiresAt: string;
};

export class DuplicateAuthEmailError extends Error {
    constructor() {
        super('Email already exists');
    }
}

export class AuthAccountCreateFailedError extends Error {
    constructor() {
        super('Error while creating account');
    }
}

export interface AuthRepository {
    getAccountTotp(accountId: string): Promise<AuthTotpRecord | null>;
    findFirstProfile(accountId: string): Promise<AuthProfileRecord | null>;
    findAccountByEmail(email: string): Promise<AuthAccountRecord | null>;
    findAccountById(accountId: string): Promise<AuthAccountRecord | null>;
    findUserAccountById(accountId: string): Promise<AuthAccountRecord | null>;
    findAccountEmail(accountId: string): Promise<{ id: string; email: string } | null>;
    createAccountWithVerificationToken(data: CreateAccountWithVerificationTokenInput): Promise<AuthAccountRecord>;
    findAccountTokenByHash(data: { tokenHash: string; type: AuthAccountTokenType }): Promise<AuthAccountTokenRecord | null>;
    createLoginChallenge(data: { accountId: string; tokenHash: string; expiresAt: string }): Promise<void>;
    deleteAccountToken(tokenId: string): Promise<void>;
    verifyEmailToken(data: { accountId: string; tokenId: string }): Promise<void>;
    listUnusedBackupCodes(accountId: string): Promise<AuthBackupCodeRecord[]>;
    markBackupCodeUsed(data: { backupCodeId: string; usedAt: Date }): Promise<boolean>;
    hasUnusedBackupCode(accountId: string): Promise<boolean>;
    findProfileIdForAccount(data: { accountId: string; profileId: string }): Promise<string | null>;
    createSession(data: CreateSessionInput): Promise<string | null>;
    findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
    findSessionById(sessionId: string): Promise<AuthSessionRecord | null>;
    revokeSessionIfActive(data: { sessionId: string; revokedAt: string }): Promise<void>;
    refreshSession(data: RefreshSessionInput): Promise<boolean>;
}

export interface AuthPasswordHasher {
    hash(password: string): Promise<string>;
    verify(hash: string, password: string): Promise<boolean>;
}

export interface AuthOpaqueTokenService {
    generate(): string;
    hash(token: string): string;
}

export type AuthAccessTokenPayload = {
    sub: string;
    role: UserRole;
    isVerified: boolean;
    sid?: string;
    profileId?: string;
};

export type AuthStepUpTokenPayload = {
    sub: string;
    scope: string;
    stepUp: true;
};

export interface AuthTokenService {
    signAccessToken(payload: AuthAccessTokenPayload): string;
    signStepUpToken(payload: AuthStepUpTokenPayload, expiresIn: number): string;
    verifyAccessToken(token: string, options?: { ignoreExpiration?: boolean }): AuthAccessTokenPayload;
}

export interface AuthTotpVerifier {
    verify(data: { secret: string; token: string }): Promise<boolean>;
}

export interface AuthSystemSettingsProvider {
    get(): Promise<SystemSettingsT>;
}

export interface AuthVerificationMailer {
    sendVerificationMail(name: string, email: string, token: string): Promise<void>;
}

export type AuthAuditLogInput = {
    actorAccountId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
};

export interface AuthAuditLogger {
    createAuditLog(data: AuthAuditLogInput): Promise<void>;
}

export interface AuthLogger {
    error(data: unknown, message: string): void;
}

export interface AuthDeviceParser {
    parse(context: { userAgent?: string | null; clientHints?: ClientHints }): ParsedDevice;
}

export interface AuthAttemptLimiterPort {
    checkLogin(email: string): void;
    checkRegister(email: string): void;
    recordFailedLogin(email: string): void;
    recordFailedRegister(email: string): void;
    resetLogin(email: string): void;
    resetRegister(email: string): void;
}

export type AuthRateLimitError = TooManyAuthAttemptsError | AuthTemporarilyLockedError;
