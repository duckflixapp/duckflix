import z from 'zod';

export const videoParamsSchema = z.object({
    videoId: z.uuid('Invalid video ID'),
});

export const subtitleParamsSchema = videoParamsSchema.extend({
    subtitleId: z.uuid('Invalid subtitle ID'),
});

export const uploadBodySchema = z.object({
    subtitle: z.file(),
    language: z.string().length(2),
});

export const searchQuerySchema = z.object({
    language: z.string().length(2),
});

export const importBodySchema = z.object({
    fileId: z.number().int().positive(),
});
