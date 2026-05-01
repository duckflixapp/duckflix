import type { ProfileDTO } from '@duckflixapp/shared';
import { db } from '@shared/configs/db';
import { accounts, profiles } from '@shared/schema';
import { AppError } from '@shared/errors';
import { toProfileDTO } from '@shared/mappers/user.mapper';
import { signToken } from '@utils/jwt';
import { and, eq } from 'drizzle-orm';

export const getAccountProfiles = async (accountId: string): Promise<ProfileDTO[]> => {
    const results = await db.select().from(profiles).where(eq(profiles.accountId, accountId)).orderBy(profiles.createdAt);

    return results.map(toProfileDTO);
};

export const getProfileById = async (data: { accountId: string; profileId: string }): Promise<ProfileDTO> => {
    const [profile] = await db
        .select({ id: profiles.id, accountId: profiles.accountId, name: profiles.name, createdAt: profiles.createdAt })
        .from(profiles)
        .where(and(eq(profiles.id, data.profileId), eq(profiles.accountId, data.accountId)))
        .limit(1);

    if (!profile) throw new AppError('Profile not found', { statusCode: 404 });

    return toProfileDTO(profile);
};

export const selectProfile = async (data: { accountId: string; sessionId: string; profileId: string }) => {
    const [profile] = await db
        .select({ id: profiles.id, accountId: profiles.accountId, name: profiles.name, createdAt: profiles.createdAt })
        .from(profiles)
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
