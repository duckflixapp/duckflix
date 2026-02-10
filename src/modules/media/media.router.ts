import { Router } from 'express';
import * as MediaController from './media.controller';

const router = Router();

router.get('/stream/:versionId', MediaController.stream);

export default router;
