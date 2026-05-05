import type { UserRole } from '@duckflixapp/shared';

export type AccountMeRecord = {
    id: string;
    email: string;
    role: UserRole;
    system: boolean;
    isVerified: boolean;
    createdAt: string;
};

export type AccountTotpRecord = {
    accountId: string;
    secret: string | null;
    pendingSecret: string | null;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
};

export type AccountNotificationRecord = {
    id: string;
    accountId: string | null;
    videoId: string | null;
    videoVerId: string | null;
    type: 'info' | 'error' | 'success' | 'warning';
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
};

export type AccountSessionRecord = {
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

export interface AccountRepository {
    findAccountMe(accountId: string): Promise<AccountMeRecord | null>;
    findUserEmail(accountId: string): Promise<{ email: string } | null>;
    userExists(accountId: string): Promise<boolean>;
    getTotp(accountId: string): Promise<AccountTotpRecord | null>;
    listNotifications(accountId: string): Promise<AccountNotificationRecord[]>;
    markNotifications(accountId: string, options: { markAll: boolean; notificationIds?: string[] }): Promise<void>;
    clearNotifications(accountId: string): Promise<void>;
    deleteAccountWithAudit(accountId: string): Promise<boolean>;
    listActiveSessions(data: { accountId: string; now: string }): Promise<AccountSessionRecord[]>;
    findSessionById(data: { accountId: string; sessionId: string }): Promise<AccountSessionRecord | null>;
    revokeSession(data: { accountId: string; sessionId: string; revokedAt: string }): Promise<void>;
    resetPasswordWithAudit(data: {
        accountId: string;
        passwordHash: string;
        currentSessionId: string;
        revokedAt: string;
    }): Promise<boolean>;
    countUnusedBackupCodes(accountId: string): Promise<number>;
    savePendingTotp(data: { accountId: string; pendingSecret: string; updatedAt: string }): Promise<void>;
    cancelPendingTotp(data: { accountId: string; updatedAt: string }): Promise<void>;
    activateTotp(data: { accountId: string; secret: string; backupCodeHashes: string[]; updatedAt: string }): Promise<void>;
    deactivateTotp(data: { accountId: string; updatedAt: string }): Promise<void>;
}

export interface AccountPasswordHasher {
    hash(value: string): Promise<string>;
}

export interface AccountTotpProvider {
    generateSecret(): string;
    generateURI(data: { issuer: string; label: string; secret: string }): string;
    verify(data: { token: string; secret: string }): Promise<boolean>;
}

export interface AccountQrCodeGenerator {
    toDataURL(value: string): Promise<string>;
}

export interface AccountBackupCodeGenerator {
    generate(): string;
}

export type AccountAuditLogInput = {
    actorAccountId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
};

export interface AccountAuditLogger {
    createAuditLog(data: AccountAuditLogInput): Promise<void>;
}
