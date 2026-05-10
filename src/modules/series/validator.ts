import z, { uuid } from 'zod';

export const seriesQuerySchema = z.object({
    page: z.coerce.number().int().positive().max(10000, 'Page limit exceeded').default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    orderBy: z.string().max(100).optional(),
    genreId: z.uuid().optional(),
    search: z.string().max(100, 'Search query too long').optional(),
});

export const seriesParamSchema = z.object({
    seriesId: uuid('Invalid series ID'),
});

export const seasonParamSchema = z.object({
    seasonId: uuid('Invalid season ID'),
});

export const episodeParamSchema = z.object({
    episodeId: uuid('Invalid episode ID'),
});

export type SeriesQueryInput = z.infer<typeof seriesQuerySchema>;
