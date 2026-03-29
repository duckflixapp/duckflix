import type { Request, Response } from 'express';
import * as MoviesService from './services/movies.service';
import * as GenresService from './services/genres.service';
import { catchAsync } from '@utils/catchAsync';
import { AppError } from '@shared/errors';
import { movieParamsSchema, movieQuerySchema, updateMovieSchema } from './validators/movies.validator';
import { createGenreSchema } from './validators/genres.validator';
import * as MetadataService from '@shared/services/metadata/metadata.service';

export const getMany = catchAsync(async (req: Request, res: Response) => {
    const options = movieQuerySchema.parse(req.query);

    const paginatedResults = await MoviesService.getMovies(options);

    res.status(200).json({
        status: 'success',
        ...paginatedResults,
    });
});

export const getFeatured = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const movieDto = await MoviesService.getFeatured({ userId });

    if (!movieDto) throw new AppError('Movie not found', { statusCode: 404 });

    res.status(200).json({
        status: 'success',
        data: { movie: movieDto },
    });
});

export const getOne = catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { id } = movieParamsSchema.parse(req.params);
    const movieDto = await MoviesService.getMovieById(id, { userId });

    if (!movieDto) throw new AppError('Movie not found', { statusCode: 404 });

    res.status(200).json({
        status: 'success',
        data: { movie: movieDto },
    });
});

export const updateOne = catchAsync(async (req: Request, res: Response) => {
    const { id } = movieParamsSchema.parse(req.params);
    const validatedData = updateMovieSchema.parse(req.body);

    const enrichMetadata = MetadataService.metadataUpdateEnrichers['movie'];
    const metadata = await enrichMetadata(validatedData.dbUrl, validatedData);

    if (!metadata) throw new AppError('No metadata', { statusCode: 400 });

    const movie = await MoviesService.updateMovieById(id, metadata);
    res.status(200).json({
        status: 'success',
        data: { movie },
    });
});

export const createGenre = catchAsync(async (req: Request, res: Response) => {
    const { name } = createGenreSchema.parse(req.body);

    const genre = await GenresService.createGenre(name);

    res.status(200).json({
        status: 'success',
        data: { genre },
    });
});

export const getManyGenres = catchAsync(async (req: Request, res: Response) => {
    const genresDto = await GenresService.getGenres();

    res.status(200).json({
        status: 'success',
        data: { genres: genresDto },
    });
});

export const saveMovieWatch = catchAsync(async (req: Request, res: Response) => {
    const { id } = movieParamsSchema.parse(req.params);

    await MoviesService.recordWatchStart(id, req.user!.id);

    res.status(201).json({
        status: 'success',
    });
});
