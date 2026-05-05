import type { AccountSessionDTO, AccountSessionMinDTO, AccountTwoFactorStatusDTO, NotificationDTO, UserRole } from '@duckflixapp/shared';

import { AppError } from '@shared/errors';
import { toAccountSessionDTO, toAccountSessionMinDTO, toAccountTwoFactorStatusDTO } from '@shared/mappers/account.mapper';
import { toNotificationDTO } from '@shared/mappers/notification.mapper';
import type { AccountPasswordHasher, AccountRepository } from './account.ports';

export type AccountMeDTO = {
    id: string;
    email: string;
    role: UserRole;
    system: boolean;
    isVerified: boolean;
    isTotpEnabled: boolean;
    createdAt: string;
};

export type AccountNotificationsDTO = {
    notifications: NotificationDTO[];
    meta: {
        totalItems: number;
        itemCount: number;
        itemsPerPage: number;
        totalPages: number;
        currentPage: number;
    };
};

type AccountServiceDependencies = {
    accountRepository: AccountRepository;
    passwordHasher: AccountPasswordHasher;
};

export const createAccountService = ({ accountRepository, passwordHasher }: AccountServiceDependencies) => {
    const getMe = async (accountId: string): Promise<AccountMeDTO> => {
        const account = await accountRepository.findAccountMe(accountId);
        if (!account) throw new AppError('Account not found', { statusCode: 404 });

        const totp = await accountRepository.getTotp(account.id);

        return {
            ...account,
            isTotpEnabled: Boolean(totp?.enabled && totp.secret),
        };
    };

    const getAccountNotifications = async (
        accountId: string,
        options: { page: number; limit: number }
    ): Promise<AccountNotificationsDTO> => {
        const { results, totalItems } = await accountRepository.listNotifications(accountId, options);

        return {
            notifications: results.map(toNotificationDTO),
            meta: {
                totalItems,
                itemCount: results.length,
                itemsPerPage: options.limit,
                totalPages: Math.ceil(totalItems / options.limit),
                currentPage: options.page,
            },
        };
    };

    const markAccountNotifications = (accountId: string, options: { markAll: boolean; notificationIds?: string[] }) =>
        accountRepository.markNotifications(accountId, options);

    const clearAccountNotifications = (accountId: string): Promise<void> => accountRepository.clearNotifications(accountId);

    const deleteAccount = async (accountId: string) => {
        const deleted = await accountRepository.deleteAccountWithAudit(accountId);
        if (!deleted) throw new AppError('User not found', { statusCode: 404 });
    };

    const getSessions = async (data: { accountId: string; currentSessionId: string }): Promise<AccountSessionMinDTO[]> => {
        const result = await accountRepository.listActiveSessions({
            accountId: data.accountId,
            now: new Date().toISOString(),
        });

        return result.map((session) => toAccountSessionMinDTO(session, data.currentSessionId ?? null));
    };

    const getSessionById = async (data: {
        accountId: string;
        sessionId: string;
        currentSessionId?: string | null;
    }): Promise<AccountSessionDTO> => {
        const session = await accountRepository.findSessionById({ accountId: data.accountId, sessionId: data.sessionId });

        if (!session) throw new AppError('Session not found', { statusCode: 404 });

        return toAccountSessionDTO(session, data.currentSessionId);
    };

    const revokeSessionById = async (data: { accountId: string; sessionId: string; currentSessionId: string }): Promise<void> => {
        if (data.sessionId == data.currentSessionId)
            throw new AppError('User should not be able to revoke this session. Please use logout', { statusCode: 403 });

        await accountRepository.revokeSession({
            accountId: data.accountId,
            sessionId: data.sessionId,
            revokedAt: new Date().toISOString(),
        });
    };

    const resetPassword = async (data: { accountId: string; password: string; sessionId: string }) => {
        const hashedPassword = await passwordHasher.hash(data.password);
        const updated = await accountRepository.resetPasswordWithAudit({
            accountId: data.accountId,
            passwordHash: hashedPassword,
            currentSessionId: data.sessionId,
            revokedAt: new Date().toISOString(),
        });

        if (!updated) throw new AppError('User not found or deleted', { statusCode: 404 });
    };

    const getTwoFactorStatus = async (accountId: string): Promise<AccountTwoFactorStatusDTO> => {
        const exists = await accountRepository.userExists(accountId);
        if (!exists) throw new AppError('User not found', { statusCode: 404 });

        const totp = await accountRepository.getTotp(accountId);

        const authenticatorEnabled = Boolean(totp?.enabled && totp.secret);
        const remainingBackupCodes = await accountRepository.countUnusedBackupCodes(accountId);

        return toAccountTwoFactorStatusDTO({
            authenticatorEnabled,
            authenticatorPendingSetup: !authenticatorEnabled && !!totp?.pendingSecret,
            remainingBackupCodes,
        });
    };

    return {
        clearAccountNotifications,
        deleteAccount,
        getAccountNotifications,
        getMe,
        getSessionById,
        getSessions,
        getTwoFactorStatus,
        markAccountNotifications,
        resetPassword,
        revokeSessionById,
    };
};

export type AccountService = ReturnType<typeof createAccountService>;
