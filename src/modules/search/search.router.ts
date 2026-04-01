// GET /api/search?q=breaking&type=all&page=1
// GET /api/search?q=breaking&type=movie
// GET /api/search?q=breaking&type=series
// GET /api/search/featured
// GET /api/search/genres?type=movie

import { limiterConfigs } from '@shared/limiters';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as SearchController from './search.controller';

const router = Router();

router.get(
    '/',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 3 * 1000, // 45 per 3s
        limit: 45,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    SearchController.search
);

export default router;
