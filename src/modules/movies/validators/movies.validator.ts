import { z } from 'zod';

export const createMovieSchema = z
    .object({
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

        genreIds: z
            .preprocess(
                (val) => {
                    if (typeof val === 'string') return [val];
                    return val;
                },
                z.array(z.uuid('Invalid genre ID')).min(1, 'Select at least one genre').max(10)
            )
            .optional()
            .default([]),
    })
    .refine(
        (data) => {
            if (data.dbUrl && data.dbUrl.trim().length > 0) return true;

            const hasTitle = !!(data.title && data.title.trim().length > 0);
            const hasGenres = !!(data.genreIds && data.genreIds.length > 0);

            return hasTitle && hasGenres;
        },
        {
            message: 'You must provide either a valid DB URL or manual movie information (Title and Genres).',
            path: ['dbUrl'],
        }
    );

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

export type CreateMovieInput = z.infer<typeof createMovieSchema>;
export type MovieQueryInput = z.infer<typeof movieQuerySchema>;
