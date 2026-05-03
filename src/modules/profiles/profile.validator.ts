import { z } from 'zod';

const profilePinSchema = z.string().regex(/^\d{4}$/, 'Profile PIN must be exactly 4 digits');

export const profileParamsSchema = z.object({
    id: z.uuid(),
});

export const updateProfileAvatarSchema = z.object({
    avatarAssetId: z.uuid().nullable(),
});

export const createProfileSchema = z.object({
    name: z.string().trim().min(2).max(32),
    avatarAssetId: z.uuid().nullable().optional(),
    pin: profilePinSchema.optional(),
});

export const selectProfileSchema = z
    .object({
        pin: profilePinSchema.optional(),
    })
    .optional();

export const updateProfilePinSchema = z.object({
    pin: profilePinSchema,
    currentPin: profilePinSchema.optional(),
});

export const removeProfilePinSchema = z.object({
    pin: profilePinSchema,
});

export const deleteProfileSchema = z
    .object({
        pin: profilePinSchema.optional(),
    })
    .optional();
