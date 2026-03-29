import rateLimit from 'express-rate-limit';
import { movieUpload } from '@shared/configs/multer.config';
import { limiterConfigs } from '@shared/limiters';
import { hasRole } from '@shared/middlewares/auth.middleware';
import * as VideoController from './video.controller';
import * as VideoVersionsController from './versions.controller';
import { Router } from 'express';

const router = Router();

router.post(
    '/upload',
    hasRole('contributor'),
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 30 * 1000, // 20 per 30s
        limit: 20,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    movieUpload.fields([
        { name: 'video', maxCount: 1 },
        { name: 'torrent', maxCount: 1 },
    ]),
    VideoController.upload
);

router.get(
    '/:id',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 20 per 30s
        limit: 30,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    VideoController.getVideo
);

router.delete(
    '/:id',
    hasRole('contributor'),
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 20 per 30s
        limit: 30,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    VideoController.deleteVideo
);

router.get(
    '/:id/resolve',
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 20 per 30s
        limit: 30,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    VideoController.resolveVideo
);

router.get(
    '/:id/versions/',
    hasRole('contributor'),
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 30 per 2s
        limit: 30,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    VideoVersionsController.getMany
);

router.post(
    '/:id/versions',
    hasRole('contributor'),
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 30 per 2s
        limit: 30,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    VideoVersionsController.addVersion
);

router.delete(
    '/:id/versions/:versionId',
    hasRole('contributor'),
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 2 * 1000, // 30 per 2s
        limit: 30,
        keyGenerator: limiterConfigs.authenticatedKey,
    }),
    VideoVersionsController.deleteVersion
);

export default router;
