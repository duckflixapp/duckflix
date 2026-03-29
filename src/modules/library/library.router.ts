import { Router } from 'express';
import * as LibraryController from './library.controller';
import rateLimit from 'express-rate-limit';
import { limiterConfigs } from '@shared/limiters';

const router = Router();

const defaultLimiter = () =>
    rateLimit({
        ...limiterConfigs.defaults(),
        windowMs: 3 * 1000, // 45 per 3s
        limit: 45,
        keyGenerator: limiterConfigs.authenticatedKey,
    });

router.get('/', defaultLimiter(), LibraryController.getUserLibraries);

router.post('/', defaultLimiter(), LibraryController.createLibrary);
router.get('/:id', defaultLimiter(), LibraryController.getLibrary);
router.delete('/:id', defaultLimiter(), LibraryController.removeLibrary);

router.get('/:id/movies/', defaultLimiter(), LibraryController.getLibraryMovies);
router.post('/:libraryId/movies/:movieId', defaultLimiter(), LibraryController.addMovie);
router.delete('/:libraryId/movies/:movieId', defaultLimiter(), LibraryController.removeMovie);

export default router;
