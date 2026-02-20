import { Router } from 'express';
import * as AuthController from './auth.controller';
import rateLimit from 'express-rate-limit';
import { limiterConfigs } from '../../shared/limiters';

const router = Router();

router.post(
    '/register',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 30 * 1000, // 10 per 30s
        limit: 10,
    }),
    AuthController.register
);
router.post(
    '/verify-email',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 30 * 1000, // 10 per 30s
        limit: 10,
    }),
    AuthController.verifyEmail
);
router.post(
    '/login',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 30 * 1000, // 20 per 30s
        limit: 20,
    }),
    AuthController.login
);
router.post(
    '/logout',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 10 * 1000, // 10 per 10s
        limit: 10,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    AuthController.logout
);

router.post(
    '/refresh',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 10 * 1000, // 10 per 10s
        limit: 10,
    }),
    AuthController.refresh
);

export default router;
