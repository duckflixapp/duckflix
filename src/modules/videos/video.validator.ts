import z from 'zod';

const baseUploadSchema = z.object({
    dbUrl: z.url().max(1000).optional().nullable(),
    processor: z.string().trim().min(1).max(64),
});

const baseSourceTextUpload = baseUploadSchema.extend({
    sourceType: z.literal('text'),
    source: z.string().trim().min(1).max(4000),
});
const baseSourceFileUpload = baseUploadSchema.extend({
    sourceType: z.literal('file'),
    source: z.file(),
});

const baseVideoUploadSchema = z.discriminatedUnion('sourceType', [baseSourceFileUpload, baseSourceTextUpload]);

const createMovieSchema = z.object({
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

const createEpisodeSchema = z.object({
    type: z.literal('episode'),
    name: z.string().min(1).max(255).optional().nullable(),
    overview: z.string().max(1000).optional().nullable(),
    seasonId: z.uuid().optional().nullable(),
    seriesId: z.uuid().optional().nullable(),
    seasonNumber: z.coerce.number().int().positive().optional().nullable(),
    episodeNumber: z.coerce.number().int().positive().optional().nullable(),
});

const createVideoMetaSchema = z.discriminatedUnion('type', [createMovieSchema, createEpisodeSchema]);

export const createVideoSchema = baseVideoUploadSchema.and(createVideoMetaSchema);

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
