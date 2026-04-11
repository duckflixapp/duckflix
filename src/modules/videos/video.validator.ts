import z from 'zod';

const baseVideoSchema = z.object({
    dbUrl: z.url().max(1000).optional().nullable(),
    video: z.file().optional(),
    torrent: z.file().optional(),
});

const createMovieSchema = baseVideoSchema.extend({
    type: z.literal('movie'),
    title: z.string().min(1).max(255).optional().nullable(),
    overview: z.string().max(1000).optional().nullable(),
    releaseYear: z.coerce
        .number()
        .int()
        .min(1888)
        .max(new Date().getFullYear() + 10)
        .optional()
        .nullable(),
    bannerUrl: z.url().max(1000).optional().nullable(),
    posterUrl: z.url().max(1000).optional().nullable(),
    genres: z
        .preprocess((val) => (typeof val === 'string' ? [val] : val), z.array(z.string()).max(10))
        .optional()
        .default([]),
});

const createEpisodeSchema = baseVideoSchema.extend({
    type: z.literal('episode'),
    name: z.string().min(1).max(255).optional().nullable(),
    overview: z.string().max(1000).optional().nullable(),
    seasonId: z.uuid().optional().nullable(),
    seriesId: z.uuid().optional().nullable(),
    seasonNumber: z.coerce.number().int().positive().optional().nullable(),
    episodeNumber: z.coerce.number().int().positive().optional().nullable(),
});

export const createVideoSchema = z.discriminatedUnion('type', [createMovieSchema, createEpisodeSchema]);

export const addVersionSchema = z.object({
    height: z.number().int().positive(),
});

export const videoParamsSchema = z.object({
    id: z.uuid('Invalid video ID format'),
});

export const videoVersionParamsSchema = videoParamsSchema.extend({
    versionId: z.uuid('Invalid video version ID format'),
});

export const createProgressSchema = z.object({
    positionSec: z.number().int().nonnegative(),
});

export type CreateMovieInput = z.infer<typeof createMovieSchema>;
export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>;
export type CreateVideoInput = z.infer<typeof createVideoSchema>;
