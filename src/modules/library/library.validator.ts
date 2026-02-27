import z from 'zod';

export const getUserLibrariesScheme = z.object({
    custom: z.boolean().optional(),
});

export const newLibraryScheme = z.object({
    name: z
        .string()
        .trim()
        .min(2)
        .max(32)
        .transform((val) => val.replace(/\s+/g, ' ')),
});

export const libraryMovieItemScheme = z.object({
    libraryId: z.uuid(),
    movieId: z.uuid(),
});

export const libraryScheme = z.object({
    id: z.uuid(),
});
