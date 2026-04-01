import z from 'zod';

export const movieMetadataSchema = z.object({
    type: z.literal('movie'),
    title: z.string().min(1).max(512),
    overview: z.string().max(1024).nullable().optional(),
    releaseYear: z.number().nullable().optional(),
    posterUrl: z.url().nullable().optional(),
    bannerUrl: z.url().nullable().optional(),
    genres: z.array(z.string()),
    rating: z.number().nullable(),
    runtime: z.number().positive().nullable().optional(),
    imdbId: z.string().nullable(),
    tmdbId: z.number().int().positive(),
});

export const episodeMetadataSchema = z.object({
    type: z.literal('episode'),
    name: z.string().min(1).max(512),
    overview: z.string().max(1024).nullable().optional(),
    airDate: z.date().nullable().optional(),
    runtime: z.number().positive().nullable().optional(),
    rating: z.number().nullable(),
    stillUrl: z.url().nullable().optional(),
    imdbId: z.string().nullable(),
    tmdbShowId: z.number().int().positive(),
    seasonNumber: z.coerce.number().int().positive(),
    episodeNumber: z.coerce.number().int().positive(),
});

export type MovieMetadata = z.infer<typeof movieMetadataSchema>;
export type EpisodeMetadata = z.infer<typeof episodeMetadataSchema>;
