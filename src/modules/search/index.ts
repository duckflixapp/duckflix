import { Elysia } from 'elysia';
import { createRateLimit } from '@shared/configs/ratelimit';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { searchQuerySchema } from './search.validator';
import { searchService } from './search.container';

const searchLimiter = createRateLimit({
    max: 45,
    duration: 3000,
});

export const searchRouter = new Elysia({ prefix: '/search' })
    .use(authGuard)
    .use(searchLimiter)
    .guard({ auth: true })
    .get(
        '/',
        async ({ query }) => {
            const options = {
                q: query.q ?? null,
                limit: query.limit,
                page: query.page,
                sort: query.sort,
                genres: query.genres,
            };

            const paginatedData = await searchService.unifiedSearch(options);

            return {
                status: 'success',
                ...paginatedData,
            };
        },
        {
            query: searchQuerySchema,
            detail: {
                tags: ['Search'],
                summary: 'Search Unified',
            },
        }
    );
