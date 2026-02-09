import { Router } from 'express';
import authRouter from '../modules/auth/auth.router';
import { csrfGuard } from '../shared/middlewares/csrf.middleware';
import { authenticate } from '../shared/middlewares/auth.middleware';

const router = Router();

// unprotected
router.use('/auth', authRouter);

// protected
router.use([authenticate, csrfGuard]);

export default router;
