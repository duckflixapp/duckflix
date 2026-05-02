import { z } from 'zod';

export const profileParamsSchema = z.object({
    id: z.uuid(),
});

export const updateProfileAvatarSchema = z.object({
    avatarAssetId: z.uuid().nullable(),
});

export const createProfileSchema = z.object({
    name: z.string().trim().min(2).max(32),
    avatarAssetId: z.uuid().nullable().optional(),
});
