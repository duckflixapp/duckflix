import type { Request, Response } from 'express';
import { catchAsync } from '@utils/catchAsync';
import * as LibraryService from './library.service';
import {
    getUserLibrariesScheme,
    libraryScheme,
    newLibraryScheme,
    libraryQuerySchema,
    libraryItemScheme,
    libraryItemTypeScheme,
} from './library.validator';

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

export const getLibraryItems = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id: libraryId } = libraryScheme.parse(req.params);
    const options = libraryQuerySchema.parse(req.query);

    const paginatedResults = await LibraryService.getUserLibraryItems(userId, libraryId, options);

    res.status(200).json({ status: 'success', ...paginatedResults });
});

export const addContent = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { libraryId, contentId } = libraryItemScheme.parse(req.params);
    const { type } = libraryItemTypeScheme.parse(req.query);

    await LibraryService.addContentToUserLibrary(userId, libraryId, contentId, type);

    res.status(204).json({ status: 'success' });
});

export const removeContent = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { libraryId, contentId } = libraryItemScheme.parse(req.params);
    const { type } = libraryItemTypeScheme.parse(req.query);

    await LibraryService.removeContentFromUserLibrary(userId, libraryId, contentId, type);

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
