import { Router } from 'express';
import * as AdminController from './admin.controller';
import rateLimit from 'express-rate-limit';
import { limiterConfigs } from '@shared/limiters';

const router = Router();

router.get(
    '/system',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 10 per 2s
        limit: 10,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    AdminController.getSystem
);

router.patch(
    '/system',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 10 per 2s
        limit: 10,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    AdminController.updateSystem
);

router.get(
    '/users',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 10 per 2s
        limit: 10,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    AdminController.getUsersWithRole
);

router.patch(
    '/users',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 10 per 2s
        limit: 10,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    AdminController.changeUserRole
);

router.delete(
    '/users',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 10 per 2s
        limit: 10,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    AdminController.deleteUser
);

router.get(
    '/stats',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 10 per 2s
        limit: 10,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    AdminController.getSystemStatistics
);

export default router;
