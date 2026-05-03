import { Elysia } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { createRateLimit } from '@shared/configs/ratelimit';

// Services
import { getSeriesById, deleteSeriesById } from './services/series.service';
import { getSeasonById, deleteSeasonById } from './services/season.service';
import { getEpisodeById } from './services/episode.service';

// Validators
import { episodeParamSchema, seasonParamSchema, seriesParamSchema } from './validator';

const seriesLimiter = createRateLimit({ max: 45, duration: 3000 });

export const seriesRouter = new Elysia({ prefix: '/series', detail: { tags: ['TV Shows'] } })
    .use(authGuard)
    .guard({ auth: true })
    .use(seriesLimiter)

    .group('', { detail: { tags: ['TV Series'] } }, (app) =>
        app
            .get(
                '/:seriesId',
                async ({ params: { seriesId }, user }) => {
                    const series = await getSeriesById(seriesId, { profileId: user.profileId! });
                    return { status: 'success', data: { series } };
                },
                {
                    params: seriesParamSchema,
                    detail: { summary: 'Details' },
                }
            )

            .delete(
                '/:seriesId',
                async ({ params: { seriesId }, user, set }) => {
                    await deleteSeriesById({ seriesId, accountId: user.id });
                    set.status = 204;
                },
                {
                    params: seriesParamSchema,
                    guard: { auth: 'contributor' },
                    detail: { summary: 'Remove' },
                }
            )
    )

    .group('/seasons', { detail: { tags: ['Seasons'] } }, (app) =>
        app
            .get(
                '/:seasonId',
                async ({ params: { seasonId } }) => {
                    const season = await getSeasonById(seasonId);
                    return { status: 'success', data: { season } };
                },
                {
                    params: seasonParamSchema,
                    detail: { summary: 'Details' },
                }
            )

            .delete(
                '/:seasonId',
                async ({ params: { seasonId }, user, set }) => {
                    await deleteSeasonById({ seasonId, accountId: user.id });
                    set.status = 204;
                },
                {
                    params: seasonParamSchema,
                    guard: { auth: 'contributor' },
                    detail: { summary: 'Remove' },
                }
            )
    )

    .group('/episodes', { detail: { tags: ['Episodes'] } }, (app) =>
        app.get(
            '/:episodeId',
            async ({ params: { episodeId } }) => {
                const episode = await getEpisodeById(episodeId);
                return { status: 'success', data: { episode } };
            },
            {
                params: episodeParamSchema,
                detail: { summary: 'Details' },
            }
        )
    );
