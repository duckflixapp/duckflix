import type { Request, Response } from 'express';
import * as MoviesService from './services/movies.service';
import * as GenresService from './services/genres.service';
import * as MetadataService from './services/metadata.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { AppError } from '../../shared/errors';
import { createMovieSchema, movieParamsSchema, movieQuerySchema, updateMovieSchema } from './validators/movies.validator';
import { handleWorkflowError } from './movies.handler';
import { createGenreSchema } from './validators/genres.validator';
import { processVideoWorkflow } from './workflows/video.workflow';
import { processTorrentFileWorkflow } from './workflows/torrent.workflow';

export const upload = catchAsync(async (req: Request, res: Response) => {
    const validatedData = createMovieSchema.parse(req.body);
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const videoFile = files?.['video']?.[0];
    const torrentFile = files?.['torrent']?.[0];
    if (!videoFile && !torrentFile) throw new AppError('Please provide either a valid video or torrent file', { statusCode: 400 });

    const metadata = await MetadataService.enrichMetadata(validatedData.dbUrl, validatedData);

    const movie = await MoviesService.initiateUpload({
        userId: req.user!.id,
        status: videoFile ? 'processing' : 'downloading',
        ...metadata,
    });

    if (videoFile)
        processVideoWorkflow({
            userId: req.user!.id,
            movieId: movie.id,
            imdbId: metadata.imdbId,
            tempPath: videoFile.path,
            originalName: videoFile.originalname,
            fileSize: videoFile.size,
        }).catch((e) => handleWorkflowError(movie.id, e, 'movie'));
    else if (torrentFile?.path) {
        processTorrentFileWorkflow({
            userId: req.user!.id,
            movieId: movie.id,
            movieTitle: movie.title,
            imdbId: metadata.imdbId,
            torrentPath: torrentFile?.path,
        }).catch((e) => handleWorkflowError(movie.id, e, 'torrent'));
    } else throw new Error('Please provide valid video file or torrent');

    res.status(201).json({
        status: 'success',
        message: torrentFile ? 'Torrent download initiated.' : 'Video processing started.',
        data: { movie },
    });
});

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

export const deleteOne = catchAsync(async (req: Request, res: Response) => {
    const { id } = movieParamsSchema.parse(req.params);

    await MoviesService.deleteMovieById(id);

    res.status(204).json({
        status: 'success',
    });
});

export const updateOne = catchAsync(async (req: Request, res: Response) => {
    const { id } = movieParamsSchema.parse(req.params);
    const validatedData = updateMovieSchema.parse(req.body);

    const metadata = await MetadataService.enrichUpdateMetadata(validatedData.dbUrl, validatedData);

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
