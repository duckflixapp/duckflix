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
