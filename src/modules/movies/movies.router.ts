import { Router } from 'express';
import * as MoviesController from './movies.controller';
import { movieUpload } from '../../shared/configs/multer.config';

const router = Router();

router.post(
    '/upload',
    movieUpload.fields([
        { name: 'video', maxCount: 1 },
        { name: 'torrent', maxCount: 1 },
    ]),
    MoviesController.upload
);
router.get('/', MoviesController.getMany);

router.get('/genres', MoviesController.getManyGenres);
router.post('/genres', MoviesController.createGenre);

router.get('/:id', MoviesController.getOne);

export default router;
