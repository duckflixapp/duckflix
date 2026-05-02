import type { ProfileDTO } from '@duckflixapp/shared';
import { db } from '@shared/configs/db';
import { accounts, assets, profiles } from '@shared/schema';
import { AppError } from '@shared/errors';
import { toProfileAvatarDTO, toProfileDTO, type ProfileAvatarDTO } from '@shared/mappers/user.mapper';
import { signToken } from '@utils/jwt';
import { and, eq } from 'drizzle-orm';

export const getProfileAvatars = async (): Promise<ProfileAvatarDTO[]> => {
    const results = await db
        .select({ id: assets.id, storageKey: assets.storageKey })
        .from(assets)
        .where(eq(assets.type, 'profile_avatar'))
        .orderBy(assets.createdAt);

    return results.map(toProfileAvatarDTO);
};

export const getAccountProfiles = async (accountId: string): Promise<ProfileDTO[]> => {
    const results = await db
        .select({
            id: profiles.id,
            accountId: profiles.accountId,
            name: profiles.name,
            createdAt: profiles.createdAt,
            avatarAssetId: profiles.avatarAssetId,
            avatarKey: assets.storageKey,
        })
        .from(profiles)
        .leftJoin(assets, eq(profiles.avatarAssetId, assets.id))
        .where(eq(profiles.accountId, accountId))
        .orderBy(profiles.createdAt);

    return results.map(toProfileDTO);
};

export const getProfileById = async (data: { accountId: string; profileId: string }): Promise<ProfileDTO> => {
    const [profile] = await db
        .select({
            id: profiles.id,
            accountId: profiles.accountId,
            name: profiles.name,
            createdAt: profiles.createdAt,
            avatarAssetId: profiles.avatarAssetId,
            avatarKey: assets.storageKey,
        })
        .from(profiles)
        .leftJoin(assets, eq(profiles.avatarAssetId, assets.id))
        .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
        .limit(1);

    if (!profile) throw new AppError('Profile not found', { statusCode: 404 });

    return toProfileDTO(profile);
};

export const updateProfileAvatar = async (data: {
    accountId: string;
    profileId: string;
    avatarAssetId: string | null;
}): Promise<ProfileDTO> => {
    if (data.avatarAssetId) {
        const [asset] = await db
            .select({ id: assets.id })
            .from(assets)
            .where(and(eq(assets.id, data.avatarAssetId), eq(assets.type, 'profile_avatar')))
            .limit(1);

        if (!asset) throw new AppError('Profile avatar not found', { statusCode: 404 });
    }

    const [profile] = await db
        .update(profiles)
        .set({ avatarAssetId: data.avatarAssetId })
        .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
        .returning({ id: profiles.id });

    if (!profile) throw new AppError('Profile not found', { statusCode: 404 });

    return getProfileById({ accountId: data.accountId, profileId: profile.id });
};

export const selectProfile = async (data: { accountId: string; sessionId: string; profileId: string }) => {
    const [profile] = await db
        .select({
            id: profiles.id,
            accountId: profiles.accountId,
            name: profiles.name,
            createdAt: profiles.createdAt,
            avatarAssetId: profiles.avatarAssetId,
            avatarKey: assets.storageKey,
        })
        .from(profiles)
        .leftJoin(assets, eq(profiles.avatarAssetId, assets.id))
        .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
        .limit(1);

    if (!profile) throw new AppError('Profile not found', { statusCode: 404 });

    const [account] = await db
        .select({ role: accounts.role, verified_email: accounts.verified_email })
        .from(accounts)
        .where(and(eq(accounts.id, data.accountId), eq(accounts.system, false)))
        .limit(1);

    if (!account) throw new AppError('Account not found', { statusCode: 404 });

    const token = signToken({
        sub: data.accountId,
        role: account.role,
        isVerified: account.verified_email,
        sid: data.sessionId,
        profileId: profile.id,
    });

    return { token, profile: toProfileDTO(profile) };
};

export const removeProfile = async (data: { accountId: string; sessionId: string }) => {
    const [account] = await db
        .select({ role: accounts.role, verified_email: accounts.verified_email })
        .from(accounts)
        .where(and(eq(accounts.id, data.accountId), eq(accounts.system, false)))
        .limit(1);

    if (!account) throw new AppError('Account not found', { statusCode: 404 });

    const token = signToken({
        sub: data.accountId,
        role: account.role,
        isVerified: account.verified_email,
        sid: data.sessionId,
        profileId: undefined,
    });

    return { token };
};
