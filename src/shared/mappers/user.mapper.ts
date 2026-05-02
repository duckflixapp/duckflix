import { env } from '@core/env';
import type { AccountDTO, AccountMinDTO, AccountRefDTO, ProfileDTO, ProfileMinDTO } from '@duckflixapp/shared';
import type { Account, Profile } from '@schema/user.schema';

const BASE_URL = new URL(env.BASE_URL).origin;

type ProfileSource = Pick<Profile, 'id' | 'accountId' | 'name' | 'createdAt'>;

export type AccountMinSource = Pick<Account, 'id' | 'role' | 'system'> & {
    profiles?: ProfileSource[] | null;
};

export type AccountRefSource = Pick<Account, 'id' | 'email' | 'role' | 'system'>;

export type AccountSource = Account & {
    profiles?: ProfileSource[] | null;
    totpEnabled?: boolean | null;
};

export const toProfileMinDTO = (profile: ProfileSource): ProfileMinDTO => ({
    id: profile.id,
    accountId: profile.accountId,
    name: profile.name,
    createdAt: profile.createdAt,
});

export const toProfileDTO = (profile: ProfileSource & { avatarAssetId: string | null; avatarKey: string | null }): ProfileDTO => ({
    ...toProfileMinDTO(profile),
    avatar: {
        id: profile.avatarAssetId,
        url: profile.avatarKey ? `${BASE_URL}/assets/${profile.avatarKey}` : null,
    },
});

export const toAccountMinDTO = (account: AccountMinSource): AccountMinDTO => ({
    id: account.id,
    role: account.role,
    profile: account.profiles?.[0] ? toProfileMinDTO(account.profiles[0]) : null,
    system: account.system,
});

export const toAccountRefDTO = (account: AccountRefSource): AccountRefDTO => ({
    id: account.id,
    email: account.email,
    role: account.role,
    system: account.system,
});

export const toAccountDTO = (account: AccountSource): AccountDTO => ({
    ...toAccountMinDTO(account),
    email: account.email,
    isVerified: account.verified_email,
    isTotpEnabled: Boolean(account.totpEnabled),
    createdAt: account.createdAt,
});
