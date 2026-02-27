import { Router } from 'express';
import * as LibraryController from './library.controller';

const router = Router();

router.get('/', LibraryController.getUserLibraries);

router.post('/', LibraryController.createLibrary);
router.get('/:id', LibraryController.getLibrary);
router.delete('/:id', LibraryController.removeLibrary);

router.get('/:id/movies/', LibraryController.getLibraryMovies);
router.post('/:libraryId/movies/:movieId', LibraryController.addMovie);
router.delete('/:libraryId/movies/:movieId', LibraryController.removeMovie);

export default router;
