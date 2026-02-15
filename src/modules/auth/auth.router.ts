import { Router } from 'express';
import * as AuthController from './auth.controller';
import { authenticate } from '../../shared/middlewares/auth.middleware';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/logout', authenticate, AuthController.logout);

export default router;
