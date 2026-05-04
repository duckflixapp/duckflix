import { count, and, eq } from 'drizzle-orm';

import { db } from '@shared/configs/db';
import { isDuplicateKey } from '@shared/db.errors';
import { accounts, assets, profiles } from '@shared/schema';
import { libraries } from '@schema/library.schema';
import {
    DuplicateProfileNameError,
    ProfileCreateFailedError,
    ProfileLimitReachedError,
    type CreateProfileRecordInput,
    type ProfileRecord,
    type ProfilesRepository,
} from './profile.ports';

const profileSelection = {
    id: profiles.id,
    accountId: profiles.accountId,
    name: profiles.name,
    pinHash: profiles.pinHash,
    createdAt: profiles.createdAt,
    avatarAssetId: profiles.avatarAssetId,
    avatarKey: assets.storageKey,
};

export const drizzleProfilesRepository: ProfilesRepository = {
    async listAvatars() {
        return db
            .select({ id: assets.id, storageKey: assets.storageKey })
            .from(assets)
            .where(eq(assets.type, 'profile_avatar'))
            .orderBy(assets.createdAt);
    },

    async listByAccount(accountId: string) {
        return db
            .select(profileSelection)
            .from(profiles)
            .leftJoin(assets, eq(profiles.avatarAssetId, assets.id))
            .where(eq(profiles.accountId, accountId))
            .orderBy(profiles.createdAt);
    },

    async findById(data: { accountId: string; profileId: string }) {
        const [profile] = await db
            .select(profileSelection)
            .from(profiles)
            .leftJoin(assets, eq(profiles.avatarAssetId, assets.id))
            .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
            .limit(1);

        return (profile as ProfileRecord | undefined) ?? null;
    },

    async findPinState(data: { accountId: string; profileId: string }) {
        const [profile] = await db
            .select({ id: profiles.id, pinHash: profiles.pinHash })
            .from(profiles)
            .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
            .limit(1);

        return profile ?? null;
    },

    async findTokenAccount(accountId: string) {
        const [account] = await db
            .select({ role: accounts.role, isVerified: accounts.verified_email })
            .from(accounts)
            .where(and(eq(accounts.id, accountId), eq(accounts.system, false)))
            .limit(1);

        return account ?? null;
    },

    async profileAvatarExists(avatarAssetId: string) {
        const [asset] = await db
            .select({ id: assets.id })
            .from(assets)
            .where(and(eq(assets.id, avatarAssetId), eq(assets.type, 'profile_avatar')))
            .limit(1);

        return Boolean(asset);
    },

    async createWithDefaultLibrary(data: CreateProfileRecordInput) {
        return db.transaction(async (tx) => {
            const [result] = await tx.select({ count: count() }).from(profiles).where(eq(profiles.accountId, data.accountId));
            if (result!.count >= data.maxProfiles) throw new ProfileLimitReachedError(data.maxProfiles);

            const [profile] = await tx
                .insert(profiles)
                .values({
                    accountId: data.accountId,
                    name: data.name,
                    avatarAssetId: data.avatarAssetId,
                    pinHash: data.pinHash,
                })
                .returning({ id: profiles.id })
                .catch((error) => {
                    if (isDuplicateKey(error)) throw new DuplicateProfileNameError();
                    throw error;
                });

            if (!profile) throw new ProfileCreateFailedError();

            await tx.insert(libraries).values({
                profileId: profile.id,
                name: data.defaultLibrary.name,
                type: data.defaultLibrary.type,
            });

            return profile.id;
        });
    },

    async updatePin(data: { accountId: string; profileId: string; pinHash: string | null }) {
        const [profile] = await db
            .update(profiles)
            .set({ pinHash: data.pinHash })
            .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
            .returning({ id: profiles.id });

        return Boolean(profile);
    },

    async deleteById(data: { accountId: string; profileId: string }) {
        const [deleted] = await db
            .delete(profiles)
            .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
            .returning({ id: profiles.id });

        return Boolean(deleted);
    },

    async updateAvatar(data: { accountId: string; profileId: string; avatarAssetId: string | null }) {
        const [profile] = await db
            .update(profiles)
            .set({ avatarAssetId: data.avatarAssetId })
            .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
            .returning({ id: profiles.id });

        return profile?.id ?? null;
    },
};
