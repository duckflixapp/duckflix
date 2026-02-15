import { Router } from 'express';
import authRouter from '../modules/auth/auth.router';
import movieRouter from '../modules/movies/movies.router';
import usersRouter from '../modules/users/user.router';
import mediaRouter from '../modules/media/media.router';
import { authenticate } from '../shared/middlewares/auth.middleware';

const router = Router();

router.use('/auth', authRouter); // can use csrf guard later myb...

router.use('/users', authenticate, usersRouter);
router.use('/movies', authenticate, movieRouter);
router.use('/media', authenticate, mediaRouter);

export default router;
