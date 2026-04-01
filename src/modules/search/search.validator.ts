import z from 'zod';

export const SORT_VALUES = ['title', 'rating', 'date', 'release'] as const;
export const SORT_ORDER_VALUES = ['asc', 'desc'] as const;

export const searchQuerySchema = z.object({
    q: z.string().max(128).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(20),
    type: z.preprocess(
        (val) => {
            if (typeof val === 'string') return val.split(',').filter((v) => !!v.length);
            if (Array.isArray(val)) return val;
            return ['movies', 'series']; // default
        },
        z
            .array(z.enum(['movies', 'series']))
            .min(1)
            .default(['movies', 'series'])
    ),
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
});
