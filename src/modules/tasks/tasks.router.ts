import { Router } from 'express';
import * as TaskController from './tasks.controller';
import rateLimit from 'express-rate-limit';
import { limiterConfigs } from '@shared/limiters';

const router = Router();

router.delete(
    '/videoVersion/:id/kill',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 10 * 1000, // 20 per 30s
        limit: 5,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    TaskController.killVideoVersionTask
);

export default router;
