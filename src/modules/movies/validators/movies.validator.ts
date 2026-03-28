import { z } from 'zod';

export const updateMovieSchema = z.object({
    dbUrl: z.url('Invalid DB URL').max(1000).optional().nullable(),
    title: z.string().min(1).max(255).optional().nullable(),
    overview: z.string().max(1000).optional().nullable(),
    releaseYear: z.coerce
        .number()
        .int()
        .min(1888)
        .max(new Date().getFullYear() + 5)
        .optional()
        .nullable(),
    bannerUrl: z.url().max(1000).optional().nullable(),
    posterUrl: z.url().max(1000).optional().nullable(),
    genres: z
        .preprocess((val) => (typeof val === 'string' ? [val] : val), z.array(z.string()).max(10))
        .nullable()
        .optional(),
});

export const movieQuerySchema = z.object({
    page: z.coerce.number().int().positive().max(10000, 'Page limit exceeded').default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    orderBy: z.string().max(100).optional(),
    genreId: z.uuid().optional(),
    search: z.string().max(100, 'Search query too long').optional(),
});

export const movieParamsSchema = z.object({
    id: z.uuid('Invalid movie ID format'),
});

export const videoVersionParamsSchema = movieParamsSchema.extend({
    versionId: z.uuid('Invalid movie version ID format'),
});

export type UpdateMovieInput = z.infer<typeof updateMovieSchema>;
export type MovieQueryInput = z.infer<typeof movieQuerySchema>;
