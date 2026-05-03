import { SORT_ORDER_VALUES, SORT_VALUES } from '@duckflixapp/shared';
import z from 'zod';

export const searchQuerySchema = z.object({
    q: z.string().max(128).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(20),
    // Sorting Defaults:
    // column,sort -> column sort
    // column -> column desc
    // undefined -> title desc
    sort: z
        .preprocess(
            (val) => {
                if (typeof val === 'string') {
                    const split = val.split(',').filter((v) => !!v.length);
                    if (split.length === 1) return [val, 'desc'];
                    return split;
                }
                if (Array.isArray(val)) return val;
                return undefined;
            },
            z.tuple([z.enum(SORT_VALUES), z.enum(SORT_ORDER_VALUES)])
        )
        .default(['title', 'desc']),
    genres: z
        .preprocess(
            (val) => {
                if (typeof val === 'string' && val.length > 0) {
                    return val.split(',').filter(Boolean);
                }
                if (Array.isArray(val)) return val;
                return [];
            },
            z.array(z.string().max(64)).transform((arr) => Array.from(new Set(arr)).map((v) => v.toLowerCase()))
        )
        .default([]),
});
