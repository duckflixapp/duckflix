import { Router } from 'express';
import authRouter from '../modules/auth/auth.router';
import movieRouter from '../modules/movies/movies.router';
import usersRouter from '../modules/users/user.router';
import mediaRouter from '../modules/media/media.router';
import adminRouter from '../modules/admin/admin.router';
import tasksRouter from '../modules/tasks/tasks.router';
import healthRouter from './health';
import { authenticate, hasRole } from '../shared/middlewares/auth.middleware';

const router = Router();

router.use('/health', healthRouter);

router.use('/auth', authRouter); // can use csrf guard later myb...
router.use('/users', usersRouter);

router.use('/movies', authenticate(), movieRouter);
router.use('/media', authenticate(), mediaRouter);

router.use('/admin', authenticate(), hasRole('admin'), adminRouter);
router.use('/tasks', authenticate(), hasRole('contributor'), tasksRouter);

export default router;
