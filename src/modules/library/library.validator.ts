import z from 'zod';

export const libraryQuerySchema = z.object({
    page: z.coerce.number().int().positive().max(10000, 'Page limit exceeded').default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().max(100, 'Search query too long').optional(),
});

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

export const libraryItemScheme = z.object({
    libraryId: z.union([z.literal('watchlist'), z.uuid()]),
    contentId: z.uuid(),
});

export const libraryItemTypeScheme = z.object({
    type: z.enum(['series', 'movie']),
});

export const libraryScheme = z.object({
    id: z.uuid(),
});
