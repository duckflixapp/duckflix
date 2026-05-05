import argon2 from 'argon2';

import { AppError } from '@shared/errors';
import { signToken } from '@utils/jwt';
import { createProfileService } from './profile.service';
import { drizzleProfilesRepository } from './profile.drizzle.repository';
import { profilePinLimiter } from './profile-pin-limiter';
import type { ProfilePinHasher, ProfileTokenIssuer } from './profile.ports';

const profilePinHasher: ProfilePinHasher = {
    hash: (pin) => argon2.hash(pin),
    verify: (hash, pin) => argon2.verify(hash, pin),
};

const profileTokenIssuer: ProfileTokenIssuer = {
    async signProfileToken(data) {
        const account = await drizzleProfilesRepository.findTokenAccount(data.accountId);
        if (!account) throw new AppError('Account not found', { statusCode: 404 });

        return signToken({
            sub: data.accountId,
            role: account.role,
            isVerified: account.isVerified,
            sid: data.sessionId,
            profileId: data.profileId,
        });
    },
};

export const profilesService = createProfileService({
    profilesRepository: drizzleProfilesRepository,
    profilePinHasher,
    profilePinLimiter,
    profileTokenIssuer,
});
