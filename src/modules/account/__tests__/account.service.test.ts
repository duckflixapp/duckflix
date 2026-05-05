import { describe, expect, test } from 'bun:test';
import { createAccountService } from '../account.service';
import type { AccountRepository } from '../account.ports';

const unused = () => {
    throw new Error('unused repository method');
};

const createRepository = (overrides: Partial<AccountRepository>): AccountRepository => ({
    findAccountMe: unused,
    findUserEmail: unused,
    userExists: unused,
    getTotp: unused,
    listNotifications: unused,
    markNotifications: unused,
    clearNotifications: unused,
    deleteAccountWithAudit: unused,
    listActiveSessions: unused,
    findSessionById: unused,
    revokeSession: unused,
    resetPasswordWithAudit: unused,
    countUnusedBackupCodes: unused,
    savePendingTotp: unused,
    cancelPendingTotp: unused,
    activateTotp: unused,
    deactivateTotp: unused,
    ...overrides,
});

describe('AccountService', () => {
    test('getAccountNotifications returns notifications with pagination metadata', async () => {
        const service = createAccountService({
            passwordHasher: { hash: async (value) => value },
            accountRepository: createRepository({
                listNotifications: async (_accountId, options) => {
                    expect(options).toEqual({ page: 2, limit: 10 });
                    return {
                        totalItems: 23,
                        results: [
                            {
                                id: 'notification-1',
                                accountId: 'account-1',
                                videoId: null,
                                videoVerId: null,
                                type: 'info',
                                title: 'Ready',
                                message: 'Notification message',
                                isRead: false,
                                createdAt: '2026-01-01T00:00:00.000Z',
                            },
                        ],
                    };
                },
            }),
        });

        const result = await service.getAccountNotifications('account-1', { page: 2, limit: 10 });

        expect(result.data).toHaveLength(1);
        expect(result.meta).toEqual({
            totalItems: 23,
            itemCount: 1,
            itemsPerPage: 10,
            totalPages: 3,
            currentPage: 2,
        });
    });
});
