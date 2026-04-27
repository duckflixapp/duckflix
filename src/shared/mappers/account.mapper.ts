import type { AccountSessionDTO, AccountTwoFactorStatusDTO } from '@duckflixapp/shared';
import type { Session } from '@shared/schema';

type AccountTwoFactorStatusSource = {
    authenticatorEnabled: boolean;
    authenticatorPendingSetup: boolean;
    remainingBackupCodes: number;
};

export const toAccountTwoFactorStatusDTO = (status: AccountTwoFactorStatusSource): AccountTwoFactorStatusDTO => ({
    enabled: status.authenticatorEnabled,
    methods: {
        authenticator: {
            enabled: status.authenticatorEnabled,
            pendingSetup: status.authenticatorPendingSetup,
        },
        backupCodes: {
            enabled: status.authenticatorEnabled && status.remainingBackupCodes > 0,
            remaining: status.remainingBackupCodes,
        },
    },
});

export const toAccountSessionDTO = (session: Session, currentSessionId?: string | null): AccountSessionDTO => ({
    id: session.id,
    deviceName: session.deviceName,
    deviceType: session.deviceType as AccountSessionDTO['deviceType'],
    browserName: session.browserName,
    osName: session.osName,
    ipAddress: session.ipAddress,
    lastIpAddress: session.lastIpAddress,
    lastRefreshedAt: session.lastRefreshedAt,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    current: session.id === currentSessionId,
});
