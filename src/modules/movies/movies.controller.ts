import type { Request, Response } from 'express';
import * as MoviesService from './movies.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { AppError } from '../../shared/errors';
import { createMovieSchema, movieParamsSchema, movieQuerySchema } from './movies.validator';

export const upload = catchAsync(async (req: Request, res: Response) => {
    const file = req.file;
    const { title } = createMovieSchema.parse(req.body);

    if (!file) throw new AppError('Video file is missing', 400);

    const movie = await MoviesService.initiateUpload({
        userId: req.userId!,
        title,
        tempPath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
    });

    res.status(201).json({
        status: 'success',
        message: 'Upload started. Movie is being processed.',
        data: { movie },
    });
});

export const getMany = catchAsync(async (req: Request, res: Response) => {
    const { page, limit, search } = movieQuerySchema.parse(req.query);

    const paginatedResults = await MoviesService.getMovies(page, limit, search);

    res.status(200).json({
        status: 'success',
        ...paginatedResults,
    });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
    const { id } = movieParamsSchema.parse(req.params);
    const movieDto = await MoviesService.getMovieById(id);

    if (!movieDto) throw new AppError('Movie not found', 404);

    res.status(200).json({
        status: 'success',
        data: { movie: movieDto },
    });
});
