import path from 'node:path';
import fs from 'node:fs/promises';
import { count, desc, eq, ilike } from 'drizzle-orm';
import { db } from '../../shared/db';
import { movies, movieVersions } from '../../shared/schema';
import { InvalidVideoFileError, MovieNotCreatedError, MovieNotFoundError } from './movies.errors';
import { randomUUID } from 'node:crypto';
import { ffprobe } from '../../shared/utils/videoProcessor';
import { createMovieStorageKey, startProcessing } from './movies.processor';
import type { MovieDetailedDTO, MovieDTO, PaginatedResponse } from '@duckflix/shared';
import { toMovieDetailedDTO, toMovieDTO } from '../../shared/mappers/movies.mapper';

const STORAGE_FOLDER = process.env.STORAGE_FOLDER ?? 'storage';

export const initiateUpload = async (data: {
    userId: string;
    title: string;
    tempPath: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
}): Promise<MovieDTO> => {
    const metadata = await ffprobe(data.tempPath).catch(() => {
        throw new InvalidVideoFileError();
    });

    const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
    if (!videoStream) throw new InvalidVideoFileError();

    const originalWidth = Number(videoStream.width) || 0;
    const originalHeight = Number(videoStream.height) || 0;

    const [dbMovie] = await db.insert(movies).values({ title: data.title, status: 'processing', userId: data.userId }).returning();
    if (!dbMovie) throw new MovieNotCreatedError();

    const movieId = dbMovie.id;

    // create path for movie version
    const fileExt = path.extname(data.originalName);
    const originalId = randomUUID();
    const storageKey = createMovieStorageKey(movieId, originalId, fileExt);
    const finalPath = path.join(STORAGE_FOLDER, storageKey);

    try {
        await fs.mkdir(path.dirname(finalPath), { recursive: true });
        await fs.rename(data.tempPath, finalPath);

        // add version and set status to ready on movie
        await db.transaction(async (tx) => {
            await tx.insert(movieVersions).values({
                id: originalId,
                movieId: movieId,
                width: originalWidth,
                height: originalHeight,
                isOriginal: true,
                storageKey: storageKey,
                fileSize: data.fileSize,
                mimeType: data.mimeType,
                status: 'ready',
            });
            await tx.update(movies).set({ status: 'ready' }).where(eq(movies.id, movieId));
        });
    } catch (err) {
        await db.delete(movies).where(eq(movies.id, movieId));
        await fs.unlink(finalPath).catch(() => {});

        throw err;
    }

    const tasksToRun = new Set<number>();
    // process original resolution if not mp4
    if (data.mimeType != 'video/mp4') {
        // try to keep standardized resolutions
        if (originalHeight >= 2160) tasksToRun.add(2160);
        else if (originalHeight >= 1440) tasksToRun.add(1440);
        else if (originalHeight >= 1080) tasksToRun.add(1080);
        else if (originalHeight >= 720) tasksToRun.add(720);
        else tasksToRun.add(originalHeight);
    }

    // process tasks for lower resolutions
    if (originalHeight > 1080) tasksToRun.add(1080);
    if (originalHeight > 720) tasksToRun.add(720);

    if (tasksToRun.size > 0) startProcessing(movieId, Array.from(tasksToRun), STORAGE_FOLDER, finalPath);

    return toMovieDTO(dbMovie);
};

export const getMovies = async (page: number, limit: number, search?: string): Promise<PaginatedResponse<MovieDTO>> => {
    const offset = (page - 1) * limit;

    const filters = search ? ilike(movies.title, `%${search}%`) : undefined;

    const [totalResult, results] = await Promise.all([
        db.select({ value: count() }).from(movies).where(filters),
        db.select().from(movies).where(filters).limit(limit).offset(offset).orderBy(desc(movies.createdAt)),
    ]);

    if (!totalResult[0]) throw new Error('DB Count() failed');

    const totalItems = Number(totalResult[0].value);

    return {
        data: results.map(toMovieDTO),
        meta: {
            totalItems,
            itemCount: results.length,
            itemsPerPage: limit,
            totalPages: Math.ceil(totalItems / limit),
            currentPage: page,
        },
    };
};

export const getMovieById = async (id: string): Promise<MovieDetailedDTO | null> => {
    const result = await db.query.movies.findFirst({
        where: eq(movies.id, id),
        with: {
            versions: true,
            user: {
                columns: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    if (!result) throw new MovieNotFoundError();

    return toMovieDetailedDTO(result);
};
