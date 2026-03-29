import { Router } from 'express';
import * as MoviesController from './movies.controller';
import { limiterConfigs } from '@shared/limiters';
import rateLimit from 'express-rate-limit';
import { hasRole } from '@shared/middlewares/auth.middleware';

const router = Router();

router.get(
    '/',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 3 * 1000, // 45 per 3s
        limit: 45,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    MoviesController.getMany
);

router.get(
    '/genres',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 50 per 2s
        limit: 50,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    MoviesController.getManyGenres
);
router.post(
    '/genres',
    hasRole('admin'),
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 4 per 2s
        limit: 4,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    MoviesController.createGenre
);

router.get(
    '/featured',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 30 per 2s
        limit: 30,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    MoviesController.getFeatured
);

router.get(
    '/:id',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 30 per 2s
        limit: 30,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    MoviesController.getOne
);

router.patch(
    '/:id',
    hasRole('contributor'),
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 30 per 2s
        limit: 30,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    MoviesController.updateOne
);

router.post(
    '/:id/watch',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 30 per 2s
        limit: 30,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    MoviesController.saveMovieWatch
);

export default router;
