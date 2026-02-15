import { Router } from 'express';
import * as UsersController from './user.controller';

const router = Router();

router.get('/@me', UsersController.getMe);
router.get('/@me/notifications', UsersController.getUserNotifications);

export default router;
