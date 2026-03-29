import { VIDEO_TYPES } from '@duckflix/shared';
import z from 'zod';

export const movieMetadataSchema = z.object({
    type: z.enum(VIDEO_TYPES),
    title: z.string().min(1),
    overview: z.string().nullable().optional(),
    releaseYear: z.number().nullable().optional(),
    posterUrl: z.url().nullable().optional(),
    bannerUrl: z.url().nullable().optional(),
    genres: z.array(z.string()),
    imdbId: z.string().nullable(),
    rating: z.number().nullable(),
});

export type MovieMetadata = z.infer<typeof movieMetadataSchema>;
