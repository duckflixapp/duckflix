import { Elysia } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { createRateLimit } from '@shared/configs/ratelimit';
import { AppError } from '@shared/errors';

import { movieGenresService, movieMetadataEnricher, moviesService } from './movies.container';

// Validators
import { movieParamsSchema, movieQuerySchema, updateMovieSchema } from './validators/movies.validator';
import { createGenreSchema } from './validators/genres.validator';

const standardLimiter = createRateLimit({ max: 30, duration: 2000 });

export const moviesRouter = new Elysia({ prefix: '/movies', detail: { tags: ['Movies'] } })
    .use(authGuard)
    .guard({ auth: true })
    .use(standardLimiter)
    .group('/genres', { detail: { tags: ['Movie Genres'] } }, (app) =>
        app
            .get(
                '/',
                async () => {
                    const genresDto = await movieGenresService.getGenres();
                    return { status: 'success', data: { genres: genresDto } };
                },
                { detail: { summary: 'List Genres' } }
            )

            .post(
                '/',
                async ({ body, set }) => {
                    const { name } = createGenreSchema.parse(body);
                    const genre = await movieGenresService.createGenre(name);
                    set.status = 201;
                    return { status: 'success', data: { genre } };
                },
                {
                    guard: { auth: 'admin' },
                    body: createGenreSchema,
                    detail: { summary: 'Add Genre' },
                }
            )
    )

    .group('', { detail: { tags: ['Movies'] } }, (app) =>
        app
            .get(
                '/',
                async ({ query }) => {
                    const options = movieQuerySchema.parse(query);
                    const paginatedResults = await moviesService.getMovies(options);
                    return { status: 'success', ...paginatedResults };
                },
                { query: movieQuerySchema, detail: { summary: 'List Movies' } }
            )

            .get(
                '/featured',
                async ({ user }) => {
                    const movieDto = await moviesService.getFeatured({ profileId: user.profileId! });
                    if (!movieDto) throw new AppError('Movie not found', { statusCode: 404 });

                    return { status: 'success', data: { movie: movieDto } };
                },
                { detail: { summary: 'Featured' } }
            )

            .get(
                '/:id',
                async ({ params: { id }, user }) => {
                    const movieDto = await moviesService.getMovieById(id, { profileId: user.profileId! });
                    if (!movieDto) throw new AppError('Movie not found', { statusCode: 404 });

                    return { status: 'success', data: { movie: movieDto } };
                },
                { params: movieParamsSchema, detail: { summary: 'Details' } }
            )

            .patch(
                '/:id',
                async ({ params: { id }, body }) => {
                    const validatedData = updateMovieSchema.parse(body);
                    const metadata = await movieMetadataEnricher.enrichMovieUpdate(validatedData.dbUrl, validatedData);

                    if (!metadata) throw new AppError('No metadata', { statusCode: 400 });

                    const movie = await moviesService.updateMovieById(id, metadata);
                    return { status: 'success', data: { movie } };
                },
                {
                    guard: { auth: 'contributor' },
                    params: movieParamsSchema,
                    body: updateMovieSchema,
                    detail: { summary: 'Update' },
                }
            )
    );
