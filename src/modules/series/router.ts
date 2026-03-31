import { limiterConfigs } from '@shared/limiters';
import { hasRole } from '@shared/middlewares/auth.middleware';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import * as EpisodeController from './episode.controller';
import * as SeasonController from './season.controller';
import * as SeriesController from './series.controller';

const router = Router();

// ------------------------------------
// Series
// ------------------------------------
router.get(
    '/:seriesId',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 3 * 1000, // 45 per 3s
        limit: 45,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    SeriesController.getOne
);

router.delete(
    '/:seriesId',
    hasRole('contributor'),
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 3 * 1000, // 45 per 3s
        limit: 45,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    SeriesController.deleteOne
);

// ------------------------------------
// Seasons
// ------------------------------------
router.get(
    '/seasons/:seasonId',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 3 * 1000, // 45 per 3s
        limit: 45,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    SeasonController.getOne
);

router.delete(
    '/seasons/:seasonId',
    hasRole('contributor'),
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 3 * 1000, // 45 per 3s
        limit: 45,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    SeasonController.deleteOne
);

// ------------------------------------
// Episodes
// ------------------------------------
router.get(
    '/episodes/:episodeId',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 3 * 1000, // 45 per 3s
        limit: 45,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    EpisodeController.getOne
);

export default router;
