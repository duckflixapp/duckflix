import { Elysia } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { createRateLimit } from '@shared/configs/ratelimit';
import { episodeService, seasonService, seriesService } from './series.container';

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
                    const series = await seriesService.getSeriesById(seriesId, { profileId: user.profileId! });
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
                    await seriesService.deleteSeriesById({ seriesId, accountId: user.id });
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
                    const season = await seasonService.getSeasonById(seasonId);
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
                    await seasonService.deleteSeasonById({ seasonId, accountId: user.id });
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
                const episode = await episodeService.getEpisodeById(episodeId);
                return { status: 'success', data: { episode } };
            },
            {
                params: episodeParamSchema,
                detail: { summary: 'Details' },
            }
        )
    );
