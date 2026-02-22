import { Router } from 'express';
import * as MediaController from './media.controller';
import { limiterConfigs } from '../../shared/limiters';
import rateLimit from 'express-rate-limit';

const router = Router();

const limiterStream = rateLimit({
    ...limiterConfigs.defaults(),
    windowMs: 1000, // 40 per 1s
    limit: 40, // because of seeking
    keyGenerator: limiterConfigs.authenticatedKey,
});

const limiterSubtitle = rateLimit({
    ...limiterConfigs.defaults(),
    windowMs: 1000, // 40 per 1s
    limit: 40, // because of seeking
    keyGenerator: limiterConfigs.authenticatedKey,
});

router.get('/stream/:versionId{/:file}', limiterStream, MediaController.stream);
router.get('/subtitle/:subtitleId', limiterSubtitle, MediaController.subtitle);

export default router;
