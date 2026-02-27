import type { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import * as LibraryService from './library.service';
import { getUserLibrariesScheme, libraryScheme, libraryMovieItemScheme, newLibraryScheme } from './library.validator';

export const getUserLibraries = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const options = getUserLibrariesScheme.parse(req.query);

    const libraries = await LibraryService.getUserLibraries(userId, options);

    res.status(200).json({
        status: 'success',
        data: {
            libraries,
        },
    });
});

export const createLibrary = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const context = newLibraryScheme.parse(req.body);

    const library = await LibraryService.createUserLibrary(userId, context);

    res.status(200).json({
        status: 'success',
        data: {
            library,
        },
    });
});

export const removeLibrary = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id: libraryId } = libraryScheme.parse(req.params);

    await LibraryService.deleteUserLibrary(userId, libraryId);

    res.status(204).json({ status: 'success' });
});

export const getLibraryMovies = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id: libraryId } = libraryScheme.parse(req.params);

    const results = await LibraryService.getUserLibraryItems(userId, libraryId);

    res.status(200).json({ status: 'success', data: results });
});

export const addMovie = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { libraryId, movieId } = libraryMovieItemScheme.parse(req.params);

    await LibraryService.addMovieToUserLibrary(userId, libraryId, movieId);

    res.status(204).json({ status: 'success' });
});

export const removeMovie = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { libraryId, movieId } = libraryMovieItemScheme.parse(req.params);

    await LibraryService.removeMovieFromUserLibrary(userId, libraryId, movieId);

    res.status(204).json({ status: 'success' });
});

export const getLibrary = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id: libraryId } = libraryScheme.parse(req.params);

    const library = await LibraryService.getUserLibrary(userId, libraryId);

    res.status(200).json({
        status: 'success',
        data: {
            library,
        },
    });
});
