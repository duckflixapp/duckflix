import type { UserDTO, UserMinDTO } from '@duckflixapp/shared';
import type { Account } from '@schema/user.schema';

export const toUserMinDTO = (user: Pick<Account, 'id' | 'name' | 'role' | 'system'>): UserMinDTO => ({
    id: user.id,
    role: user.role,
    name: user.name,
    system: user.system,
});

export const toUserDTO = (account: Account & { totpEnabled?: boolean | null }): UserDTO => ({
    ...toUserMinDTO(account),
    email: account.email,
    isVerified: account.verified_email,
    isTotpEnabled: Boolean(account.totpEnabled),
    createdAt: account.createdAt,
});
