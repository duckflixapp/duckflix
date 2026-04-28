import type { AccountSessionDTO, AccountSessionMinDTO, AccountTwoFactorStatusDTO } from '@duckflixapp/shared';
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

export const toAccountSessionMinDTO = (session: Session, currentSessionId?: string | null): AccountSessionMinDTO => ({
    id: session.id,
    deviceName: session.deviceName,
    deviceType: session.deviceType as AccountSessionDTO['deviceType'],
    browserName: session.browserName,
    osName: session.osName,
    lastRefreshedAt: session.lastRefreshedAt,
    current: session.id === currentSessionId,
});

export const toAccountSessionDTO = (session: Session, currentSessionId?: string | null): AccountSessionDTO => ({
    ...toAccountSessionMinDTO(session, currentSessionId),
    ipAddress: session.ipAddress,
    lastIpAddress: session.lastIpAddress,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
});
