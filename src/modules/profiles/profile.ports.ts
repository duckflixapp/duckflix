import type { UserRole } from '@duckflixapp/shared';

export type ProfileRecord = {
    id: string;
    accountId: string;
    name: string;
    pinHash: string | null;
    createdAt: string;
    avatarAssetId: string | null;
    avatarKey: string | null;
};

export type ProfileAvatarRecord = {
    id: string | null;
    storageKey: string | null;
};

export type ProfilePinState = {
    id: string;
    pinHash: string | null;
};

export type ProfileTokenAccount = {
    role: UserRole;
    isVerified: boolean;
};

export type CreateProfileRecordInput = {
    accountId: string;
    name: string;
    avatarAssetId: string | null;
    pinHash: string | null;
    maxProfiles: number;
    defaultLibrary: {
        name: string;
        type: 'watchlist';
    };
};

export class ProfileLimitReachedError extends Error {
    constructor(public readonly limit: number) {
        super('Profile limit reached');
    }
}

export class DuplicateProfileNameError extends Error {
    constructor() {
        super('Profile name already exists');
    }
}

export class ProfileCreateFailedError extends Error {
    constructor() {
        super('Profile not created');
    }
}

export interface ProfilesRepository {
    listAvatars(): Promise<ProfileAvatarRecord[]>;
    listByAccount(accountId: string): Promise<ProfileRecord[]>;
    findById(data: { accountId: string; profileId: string }): Promise<ProfileRecord | null>;
    findPinState(data: { accountId: string; profileId: string }): Promise<ProfilePinState | null>;
    findTokenAccount(accountId: string): Promise<ProfileTokenAccount | null>;
    profileAvatarExists(avatarAssetId: string): Promise<boolean>;
    createWithDefaultLibrary(data: CreateProfileRecordInput): Promise<string>;
    updatePin(data: { accountId: string; profileId: string; pinHash: string | null }): Promise<boolean>;
    deleteById(data: { accountId: string; profileId: string }): Promise<boolean>;
    updateAvatar(data: { accountId: string; profileId: string; avatarAssetId: string | null }): Promise<string | null>;
}

export interface ProfileTokenIssuer {
    signProfileToken(data: { accountId: string; sessionId: string; profileId?: string }): Promise<string>;
}

export interface ProfilePinHasher {
    hash(pin: string): Promise<string>;
    verify(hash: string, pin: string): Promise<boolean>;
}

export interface ProfilePinAttemptLimiter {
    check(key: string): void;
    recordFailure(key: string): void;
    reset(key: string): void;
}
