import type { ProfileDTO } from '@duckflixapp/shared';

import { limits } from '@shared/configs/limits.config';
import { AppError } from '@shared/errors';
import { toProfileAvatarDTO, toProfileDTO, type ProfileAvatarDTO } from '@shared/mappers/user.mapper';
import {
    DuplicateProfileNameError,
    ProfileCreateFailedError,
    ProfileLimitReachedError,
    type ProfilePinAttemptLimiter,
    type ProfilePinHasher,
    type ProfilesRepository,
    type ProfileTokenIssuer,
} from './profile.ports';

type ProfileServiceDependencies = {
    profilesRepository: ProfilesRepository;
    profilePinHasher: ProfilePinHasher;
    profilePinLimiter: ProfilePinAttemptLimiter;
    profileTokenIssuer: ProfileTokenIssuer;
};

const defaultLibrary = {
    name: 'My Watchlist',
    type: 'watchlist' as const,
};

export const createProfileService = ({
    profilesRepository,
    profilePinHasher,
    profilePinLimiter,
    profileTokenIssuer,
}: ProfileServiceDependencies) => {
    const getProfileAvatars = async (): Promise<ProfileAvatarDTO[]> => {
        const results = await profilesRepository.listAvatars();
        return results.map(toProfileAvatarDTO);
    };

    const getAccountProfiles = async (accountId: string): Promise<ProfileDTO[]> => {
        const results = await profilesRepository.listByAccount(accountId);
        return results.map(toProfileDTO);
    };

    const getProfileById = async (data: { accountId: string; profileId: string }): Promise<ProfileDTO> => {
        const profile = await profilesRepository.findById(data);
        if (!profile) throw new AppError('Profile not found', { statusCode: 404 });

        return toProfileDTO(profile);
    };

    const assertProfileAvatar = async (avatarAssetId: string) => {
        const exists = await profilesRepository.profileAvatarExists(avatarAssetId);
        if (!exists) throw new AppError('Profile avatar not found', { statusCode: 404 });
    };

    const signProfileToken = (data: { accountId: string; sessionId: string; profileId?: string }) =>
        profileTokenIssuer.signProfileToken(data);

    const verifyProfilePin = async (data: { accountId: string; profileId: string; pinHash: string; pin?: string }) => {
        const limiterKey = `${data.accountId}:${data.profileId}`;
        profilePinLimiter.check(limiterKey);

        if (!data.pin) throw new AppError('Profile PIN required', { statusCode: 403 });

        const valid = await profilePinHasher.verify(data.pinHash, data.pin);
        if (valid) {
            profilePinLimiter.reset(limiterKey);
            return;
        }

        profilePinLimiter.recordFailure(limiterKey);
        throw new AppError('Invalid profile PIN', { statusCode: 403 });
    };

    const getProfilePinState = async (data: { accountId: string; profileId: string }) => {
        const profile = await profilesRepository.findPinState(data);
        if (!profile) throw new AppError('Profile not found', { statusCode: 404 });

        return profile;
    };

    const createProfile = async (data: {
        accountId: string;
        sessionId: string;
        name: string;
        avatarAssetId?: string | null;
        pin?: string;
    }) => {
        if (data.avatarAssetId) await assertProfileAvatar(data.avatarAssetId);

        const name = data.name.trim();
        const pinHash = data.pin ? await profilePinHasher.hash(data.pin) : null;

        let profileId: string;
        try {
            profileId = await profilesRepository.createWithDefaultLibrary({
                accountId: data.accountId,
                name,
                avatarAssetId: data.avatarAssetId ?? null,
                pinHash,
                maxProfiles: limits.profile.limit,
                defaultLibrary,
            });
        } catch (error) {
            if (error instanceof ProfileLimitReachedError) {
                throw new AppError('Profile limit reached: ' + error.limit, { statusCode: 403 });
            }
            if (error instanceof DuplicateProfileNameError) {
                throw new AppError('Profile name already exists', { statusCode: 409 });
            }
            if (error instanceof ProfileCreateFailedError) {
                throw new AppError('Profile not created', { statusCode: 500 });
            }
            throw error;
        }

        const [token, profile] = await Promise.all([
            signProfileToken({ accountId: data.accountId, sessionId: data.sessionId, profileId }),
            getProfileById({ accountId: data.accountId, profileId }),
        ]);

        return { token, profile };
    };

    const updateProfilePin = async (data: {
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

        const pinHash = await profilePinHasher.hash(data.pin);
        const updated = await profilesRepository.updatePin({
            accountId: data.accountId,
            profileId: data.profileId,
            pinHash,
        });

        if (!updated) throw new AppError('Profile not found', { statusCode: 404 });

        return getProfileById({ accountId: data.accountId, profileId: data.profileId });
    };

    const removeProfilePin = async (data: { accountId: string; profileId: string; pin: string }): Promise<ProfileDTO> => {
        const current = await getProfilePinState({ accountId: data.accountId, profileId: data.profileId });
        if (!current.pinHash) throw new AppError('Profile PIN is not set', { statusCode: 400 });

        await verifyProfilePin({ accountId: data.accountId, profileId: data.profileId, pinHash: current.pinHash, pin: data.pin });

        const updated = await profilesRepository.updatePin({
            accountId: data.accountId,
            profileId: data.profileId,
            pinHash: null,
        });

        if (!updated) throw new AppError('Profile not found', { statusCode: 404 });

        return getProfileById({ accountId: data.accountId, profileId: data.profileId });
    };

    const deleteProfile = async (data: { accountId: string; sessionId: string; profileId: string; pin?: string }) => {
        const profile = await getProfilePinState({ accountId: data.accountId, profileId: data.profileId });
        if (profile.pinHash)
            await verifyProfilePin({ accountId: data.accountId, profileId: data.profileId, pinHash: profile.pinHash, pin: data.pin });

        const deleted = await profilesRepository.deleteById({ accountId: data.accountId, profileId: data.profileId });
        if (!deleted) throw new AppError('Profile not found', { statusCode: 404 });

        profilePinLimiter.reset(`${data.accountId}:${data.profileId}`);
        const token = await signProfileToken({ accountId: data.accountId, sessionId: data.sessionId });

        return { token };
    };

    const updateProfileAvatar = async (data: {
        accountId: string;
        profileId: string;
        avatarAssetId: string | null;
    }): Promise<ProfileDTO> => {
        if (data.avatarAssetId) await assertProfileAvatar(data.avatarAssetId);

        const profileId = await profilesRepository.updateAvatar(data);
        if (!profileId) throw new AppError('Profile not found', { statusCode: 404 });

        return getProfileById({ accountId: data.accountId, profileId });
    };

    const selectProfile = async (data: { accountId: string; sessionId: string; profileId: string; pin?: string }) => {
        const profile = await profilesRepository.findById({ accountId: data.accountId, profileId: data.profileId });

        if (!profile) throw new AppError('Profile not found', { statusCode: 404 });
        if (profile.pinHash)
            await verifyProfilePin({ accountId: data.accountId, profileId: profile.id, pinHash: profile.pinHash, pin: data.pin });

        const token = await signProfileToken({ accountId: data.accountId, sessionId: data.sessionId, profileId: profile.id });

        return { token, profile: toProfileDTO(profile) };
    };

    const clearSelectedProfile = async (data: { accountId: string; sessionId: string }) => {
        const token = await signProfileToken({ accountId: data.accountId, sessionId: data.sessionId });

        return { token };
    };

    return {
        clearSelectedProfile,
        createProfile,
        deleteProfile,
        getAccountProfiles,
        getProfileAvatars,
        getProfileById,
        removeProfilePin,
        selectProfile,
        updateProfileAvatar,
        updateProfilePin,
    };
};

export type ProfileService = ReturnType<typeof createProfileService>;
