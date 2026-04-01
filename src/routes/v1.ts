import { Router } from 'express';
import authRouter from '../modules/auth/auth.router';
import videoRouter from '../modules/videos/video.router';
import movieRouter from '../modules/movies/movies.router';
import seriesRouter from '../modules/series/router';
import usersRouter from '../modules/users/user.router';
import libraryRouter from '../modules/library/library.router';
import mediaRouter from '../modules/media/media.router';
import adminRouter from '../modules/admin/admin.router';
import tasksRouter from '../modules/tasks/tasks.router';
import searchRouter from '../modules/search/search.router';
import healthRouter from './health';
import { authenticate, hasRole } from '../shared/middlewares/auth.middleware';

const router = Router();

router.use('/health', healthRouter);

router.use('/auth', authRouter); // can use csrf guard later myb...
router.use('/users', usersRouter);

router.use('/videos', authenticate(), videoRouter);

router.use('/library', authenticate(), libraryRouter);

router.use('/movies', authenticate(), movieRouter);
router.use('/series', authenticate(), seriesRouter);
router.use('/search', authenticate(), searchRouter);

router.use('/media', mediaRouter);

router.use('/admin', authenticate(), hasRole('admin'), adminRouter);
router.use('/tasks', authenticate(), hasRole('contributor'), tasksRouter);

export default router;
