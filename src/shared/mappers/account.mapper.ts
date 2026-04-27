import type { AccountTwoFactorStatusDTO } from '@duckflixapp/shared';

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
