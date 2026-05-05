import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@shared/configs/db';
import { accountTotp, accounts, auditLogs } from '@schema/index';
import type { AdminRepository } from './admin.ports';

export const drizzleAdminRepository: AdminRepository = {
    async listUsersWithRoles(roles) {
        const results = await db.query.accounts.findMany({
            where: and(inArray(accounts.role, roles), eq(accounts.system, false)),
            with: {
                profiles: {
                    limit: 1,
                },
            },
        });

        const totpRows =
            results.length > 0
                ? await db
                      .select()
                      .from(accountTotp)
                      .where(
                          inArray(
                              accountTotp.accountId,
                              results.map((account) => account.id)
                          )
                      )
                : [];
        const totpByAccountId = new Map(totpRows.map((totp) => [totp.accountId, totp]));

        return results.map((account) => {
            const totp = totpByAccountId.get(account.id);
            return { ...account, totpEnabled: Boolean(totp?.enabled && totp.secret) };
        });
    },

    async changeUserRole(data) {
        return db.transaction(async (tx) => {
            const [user] = await tx
                .select({ id: accounts.id, email: accounts.email, role: accounts.role })
                .from(accounts)
                .where(and(eq(accounts.email, data.email), eq(accounts.system, false)));

            if (!user) return { status: 'not_found' };
            if (user.id === data.actorAccountId) return { status: 'self_target' };

            await tx.update(accounts).set({ role: data.role }).where(eq(accounts.id, user.id));
            await tx.insert(auditLogs).values({
                actorAccountId: data.actorAccountId,
                action: 'admin.user.role_changed',
                targetType: 'user',
                targetId: user.id,
                metadata: {
                    email: user.email,
                    previousRole: user.role,
                    nextRole: data.role,
                },
            });

            return { status: 'changed', user: { ...user, previousRole: user.role, role: data.role } };
        });
    },

    async deleteUser(data) {
        return db.transaction(async (tx) => {
            const [user] = await tx
                .select({ id: accounts.id, email: accounts.email, role: accounts.role })
                .from(accounts)
                .where(and(eq(accounts.email, data.email), eq(accounts.system, false)));

            if (!user) return { status: 'not_found' };
            if (user.id === data.actorAccountId) return { status: 'self_target' };

            await tx.delete(accounts).where(eq(accounts.id, user.id));
            await tx.insert(auditLogs).values({
                actorAccountId: data.actorAccountId,
                action: 'admin.user.deleted',
                targetType: 'user',
                targetId: user.id,
                metadata: {
                    email: user.email,
                    role: user.role,
                },
            });

            return { status: 'changed', user };
        });
    },
};
