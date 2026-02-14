import type { Request, Response } from 'express';
import * as MoviesService from './services/movies.service';
import * as GenresService from './services/genres.service';
import * as MetadataService from './services/metadata.service';
import { catchAsync } from '../../shared/utils/catchAsync';
import { AppError } from '../../shared/errors';
import { createMovieSchema, movieParamsSchema, movieQuerySchema } from './validators/movies.validator';
import { handleWorkflowError } from './movies.handler';

export const upload = catchAsync(async (req: Request, res: Response) => {
    const validatedData = createMovieSchema.parse(req.body);
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const videoFile = files?.['video']?.[0];
    const torrentFile = files?.['torrent']?.[0];
    if (!videoFile && !torrentFile) throw new AppError('Please provide either a video file or a magnet link', { statusCode: 400 });

    const metadata = await MetadataService.enrichMetadata(validatedData.dbUrl, validatedData);

    const movie = await MoviesService.initiateUpload({ userId: req.userId!, ...metadata });

    if (videoFile)
        MoviesService.processMovieWorkflow({
            movieId: movie.id,
            tempPath: videoFile.path,
            originalName: videoFile.originalname,
            fileSize: videoFile.size,
        }).catch((e) => handleWorkflowError(movie.id, e, 'movie'));
    else if (torrentFile?.path) {
        MoviesService.processTorrentFileWorkflow({
            movieId: movie.id,
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

    if (!movieDto) throw new AppError('Movie not found', { statusCode: 404 });

    res.status(200).json({
        status: 'success',
        data: { movie: movieDto },
    });
});

export const getManyGenres = catchAsync(async (req: Request, res: Response) => {
    const genresDto = await GenresService.getGenres();

    res.status(200).json({
        status: 'success',
        data: { genres: genresDto },
    });
});
