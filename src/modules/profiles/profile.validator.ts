import { z } from 'zod';

export const profileParamsSchema = z.object({
    id: z.uuid(),
});

export const updateProfileAvatarSchema = z.object({
    avatarAssetId: z.uuid().nullable(),
});
