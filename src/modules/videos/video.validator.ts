import { VIDEO_TYPES } from '@duckflix/shared';
import z from 'zod';

export const createVideoSchema = z.object({
    type: z.enum(VIDEO_TYPES),
    dbUrl: z.url('Invalid DB URL').max(1000).optional().nullable(),

    title: z.string().min(1, 'Title is required').max(255, 'Title is too long').optional().nullable(),
    overview: z.string().max(1000, 'Overview is too long').optional().nullable(),
    releaseYear: z.coerce
        .number()
        .int()
        .min(1888, "Movies didn't exist then")
        .max(new Date().getFullYear() + 5, 'Year is too far in the future')
        .optional()
        .nullable(),

    bannerUrl: z.url('Invalid banner URL').max(1000).optional().nullable(),
    posterUrl: z.url('Invalid poster URL').max(1000).optional().nullable(),

    genres: z
        .preprocess(
            (val) => {
                if (typeof val === 'string') return [val];
                return val;
            },
            z.array(z.string('Invalid genre name')).min(1, 'Select at least one genre').max(10)
        )
        .optional()
        .default([]),
});

export const addVersionSchema = z.object({
    height: z.number().int().positive(),
});

export const videoParamsSchema = z.object({
    id: z.uuid('Invalid video ID format'),
});

export const videoVersionParamsSchema = videoParamsSchema.extend({
    versionId: z.uuid('Invalid video version ID format'),
});

export type CreateVideoInput = z.infer<typeof createVideoSchema>;
