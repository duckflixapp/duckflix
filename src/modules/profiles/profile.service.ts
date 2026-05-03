import type { ProfileDTO } from '@duckflixapp/shared';
import argon2 from 'argon2';
import { db } from '@shared/configs/db';
import { accounts, assets, profiles } from '@shared/schema';
import { libraries } from '@schema/library.schema';
import { AppError } from '@shared/errors';
import { toProfileAvatarDTO, toProfileDTO, type ProfileAvatarDTO } from '@shared/mappers/user.mapper';
import { signToken } from '@utils/jwt';
import { and, count, eq } from 'drizzle-orm';
import { limits } from '@shared/configs/limits.config';
import { isDuplicateKey } from '@shared/db.errors';
import { profilePinLimiter } from './profile-pin-limiter';

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
            pinHash: profiles.pinHash,
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
            pinHash: profiles.pinHash,
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

const assertProfileAvatar = async (avatarAssetId: string) => {
    const [asset] = await db
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.id, avatarAssetId), eq(assets.type, 'profile_avatar')))
        .limit(1);

    if (!asset) throw new AppError('Profile avatar not found', { statusCode: 404 });
};

const getAccountForProfileToken = async (accountId: string) => {
    const [account] = await db
        .select({ role: accounts.role, verified_email: accounts.verified_email })
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.system, false)))
        .limit(1);

    if (!account) throw new AppError('Account not found', { statusCode: 404 });
    return account;
};

const signProfileToken = async (data: { accountId: string; sessionId: string; profileId?: string }) => {
    const account = await getAccountForProfileToken(data.accountId);

    return signToken({
        sub: data.accountId,
        role: account.role,
        isVerified: account.verified_email,
        sid: data.sessionId,
        profileId: data.profileId,
    });
};

const verifyProfilePin = async (data: { accountId: string; profileId: string; pinHash: string; pin?: string }) => {
    const limiterKey = `${data.accountId}:${data.profileId}`;
    profilePinLimiter.check(limiterKey);

    if (!data.pin) throw new AppError('Profile PIN required', { statusCode: 403 });

    const valid = await argon2.verify(data.pinHash, data.pin);
    if (valid) {
        profilePinLimiter.reset(limiterKey);
        return;
    }

    profilePinLimiter.recordFailure(limiterKey);
    throw new AppError('Invalid profile PIN', { statusCode: 403 });
};

const getProfilePinState = async (data: { accountId: string; profileId: string }) => {
    const [profile] = await db
        .select({ id: profiles.id, pinHash: profiles.pinHash })
        .from(profiles)
        .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
        .limit(1);

    if (!profile) throw new AppError('Profile not found', { statusCode: 404 });
    return profile;
};

export const createProfile = async (data: {
    accountId: string;
    sessionId: string;
    name: string;
    avatarAssetId?: string | null;
    pin?: string;
}) => {
    if (data.avatarAssetId) await assertProfileAvatar(data.avatarAssetId);

    const name = data.name.trim();
    const pinHash = data.pin ? await argon2.hash(data.pin) : null;

    const profileId = await db.transaction(async (tx) => {
        const [result] = await tx.select({ count: count() }).from(profiles).where(eq(profiles.accountId, data.accountId));
        if (result!.count >= limits.profile.limit)
            throw new AppError('Profile limit reached: ' + limits.profile.limit, { statusCode: 403 });

        const [profile] = await tx
            .insert(profiles)
            .values({ accountId: data.accountId, name, avatarAssetId: data.avatarAssetId ?? null, pinHash })
            .returning({ id: profiles.id })
            .catch((e) => {
                if (isDuplicateKey(e)) throw new AppError('Profile name already exists', { statusCode: 409 });
                throw e;
            });
        if (!profile) throw new AppError('Profile not created', { statusCode: 500 });

        await tx.insert(libraries).values({
            profileId: profile.id,
            name: 'My Watchlist',
            type: 'watchlist',
        });

        return profile.id;
    });

    const [token, profile] = await Promise.all([
        signProfileToken({ accountId: data.accountId, sessionId: data.sessionId, profileId }),
        getProfileById({ accountId: data.accountId, profileId }),
    ]);

    return { token, profile };
};

export const updateProfilePin = async (data: {
    accountId: string;
    profileId: string;
    pin: string;
    currentPin?: string;
}): Promise<ProfileDTO> => {
    const current = await getProfilePinState({ accountId: data.accountId, profileId: data.profileId });
    if (current.pinHash)
        await verifyProfilePin({
            accountId: data.accountId,
            profileId: data.profileId,
            pinHash: current.pinHash,
            pin: data.currentPin,
        });

    const pinHash = await argon2.hash(data.pin);
    await db
        .update(profiles)
        .set({ pinHash })
        .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)));

    return getProfileById({ accountId: data.accountId, profileId: data.profileId });
};

export const removeProfilePin = async (data: { accountId: string; profileId: string; pin: string }): Promise<ProfileDTO> => {
    const current = await getProfilePinState({ accountId: data.accountId, profileId: data.profileId });
    if (!current.pinHash) throw new AppError('Profile PIN is not set', { statusCode: 400 });

    await verifyProfilePin({ accountId: data.accountId, profileId: data.profileId, pinHash: current.pinHash, pin: data.pin });

    await db
        .update(profiles)
        .set({ pinHash: null })
        .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)));

    return getProfileById({ accountId: data.accountId, profileId: data.profileId });
};

export const deleteProfile = async (data: { accountId: string; sessionId: string; profileId: string; pin?: string }) => {
    const profile = await getProfilePinState({ accountId: data.accountId, profileId: data.profileId });
    if (profile.pinHash)
        await verifyProfilePin({ accountId: data.accountId, profileId: data.profileId, pinHash: profile.pinHash, pin: data.pin });

    const [deleted] = await db
        .delete(profiles)
        .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
        .returning({ id: profiles.id });

    if (!deleted) throw new AppError('Profile not found', { statusCode: 404 });

    profilePinLimiter.reset(`${data.accountId}:${data.profileId}`);
    const token = await signProfileToken({ accountId: data.accountId, sessionId: data.sessionId });

    return { token };
};

export const updateProfileAvatar = async (data: {
    accountId: string;
    profileId: string;
    avatarAssetId: string | null;
}): Promise<ProfileDTO> => {
    if (data.avatarAssetId) await assertProfileAvatar(data.avatarAssetId);

    const [profile] = await db
        .update(profiles)
        .set({ avatarAssetId: data.avatarAssetId })
        .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
        .returning({ id: profiles.id });

    if (!profile) throw new AppError('Profile not found', { statusCode: 404 });

    return getProfileById({ accountId: data.accountId, profileId: profile.id });
};

export const selectProfile = async (data: { accountId: string; sessionId: string; profileId: string; pin?: string }) => {
    const [profile] = await db
        .select({
            id: profiles.id,
            accountId: profiles.accountId,
            name: profiles.name,
            pinHash: profiles.pinHash,
            createdAt: profiles.createdAt,
            avatarAssetId: profiles.avatarAssetId,
            avatarKey: assets.storageKey,
        })
        .from(profiles)
        .leftJoin(assets, eq(profiles.avatarAssetId, assets.id))
        .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
        .limit(1);

    if (!profile) throw new AppError('Profile not found', { statusCode: 404 });
    if (profile.pinHash)
        await verifyProfilePin({ accountId: data.accountId, profileId: profile.id, pinHash: profile.pinHash, pin: data.pin });

    const token = await signProfileToken({ accountId: data.accountId, sessionId: data.sessionId, profileId: profile.id });

    return { token, profile: toProfileDTO(profile) };
};

export const clearSelectedProfile = async (data: { accountId: string; sessionId: string }) => {
    const token = await signProfileToken({ accountId: data.accountId, sessionId: data.sessionId });

    return { token };
};
