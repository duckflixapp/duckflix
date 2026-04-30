import type { AccountDTO, AccountMinDTO, ProfileDTO } from '@duckflixapp/shared';
import type { Account, Profile } from '@schema/user.schema';

type ProfileSource = Pick<Profile, 'id' | 'accountId' | 'name' | 'createdAt'>;

export type AccountMinSource = Pick<Account, 'id' | 'role' | 'system'> & {
    profiles?: ProfileSource[] | null;
};

export type AccountSource = Account & {
    profiles?: ProfileSource[] | null;
    totpEnabled?: boolean | null;
};

export const toProfileDTO = (profile: ProfileSource): ProfileDTO => ({
    id: profile.id,
    accountId: profile.accountId,
    name: profile.name,
    createdAt: profile.createdAt,
});

export const toAccountMinDTO = (account: AccountMinSource): AccountMinDTO => ({
    id: account.id,
    role: account.role,
    profile: account.profiles?.[0] ? toProfileDTO(account.profiles[0]) : null,
    system: account.system,
});

export const toAccountDTO = (account: AccountSource): AccountDTO => ({
    ...toAccountMinDTO(account),
    email: account.email,
    isVerified: account.verified_email,
    isTotpEnabled: Boolean(account.totpEnabled),
    createdAt: account.createdAt,
});
