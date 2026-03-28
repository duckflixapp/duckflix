import { and, asc, count, desc, eq, exists, ilike, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../../shared/configs/db';
import { libraries, libraryItems, movies, moviesToGenres, videos, videoVersions } from '../../../shared/schema';
import { MovieNotFoundError } from '../movies.errors';
import type { MovieDetailedDTO, MovieDTO, PaginatedResponse } from '@duckflix/shared';
import { toMovieDetailedDTO, toMovieDTO } from '../../../shared/mappers/movies.mapper';
import { AppError } from '../../../shared/errors';
import path from 'node:path';
import { paths } from '../../../shared/configs/path.config';
import fs from 'node:fs/promises';
import { taskRegistry } from '../../../shared/utils/taskRegistry';
import { taskHandler } from '../../../shared/utils/taskHandler';
import type { VideoMetadata } from '../../../shared/metadata/metadata.service';
import { getGenreIds } from './genres.service';

const getOrderBy = (orderBy: string | null) => {
    switch (orderBy) {
        case 'oldest':
            return [asc(movies.createdAt)];
        case 'rating':
            return [sql`cast(${movies.rating} as decimal) DESC NULLS LAST`, desc(movies.createdAt)];
        case 'title':
            return [asc(movies.title)];
        case 'newest':
        default:
            return [desc(movies.createdAt)];
    }
};

export const getMovies = async (options: {
    page: number;
    limit: number;
    search?: string;
    orderBy?: string;
    genreId?: string;
}): Promise<PaginatedResponse<MovieDTO>> => {
    const offset = (options.page - 1) * options.limit;

    const searchFilter = options.search ? ilike(movies.title, `%${options.search}%`) : null;
    // const readyFilter = eq(movies.status, 'ready');
    const genreFilter = options.genreId
        ? exists(
              db
                  .select()
                  .from(moviesToGenres)
                  .where(and(eq(moviesToGenres.movieId, movies.id), eq(moviesToGenres.genreId, options.genreId)))
          )
        : null;

    const conditions = [searchFilter, genreFilter]; // readyFilter];
    const filters = and(...conditions.filter((cond) => cond != null));

    const orderBy = getOrderBy(options.orderBy ?? null);

    const [totalResult, results] = await Promise.all([
        db.select({ value: count() }).from(movies).where(filters),
        db.query.movies.findMany({
            where: filters,
            limit: options.limit,
            offset: offset,
            orderBy,
            with: {
                genres: {
                    with: {
                        genre: true,
                    },
                },
                video: {
                    with: {
                        uploader: {
                            columns: {
                                id: true,
                                name: true,
                                role: true,
                                system: true,
                            },
                        },
                        versions: true,
                        subtitles: true,
                    },
                },
            },
        }),
    ]);

    if (!totalResult[0]) throw new Error('DB Count() failed');

    const totalItems = Number(totalResult[0].value);

    return {
        data: results.map(toMovieDTO),
        meta: {
            totalItems,
            itemCount: results.length,
            itemsPerPage: options.limit,
            totalPages: Math.ceil(totalItems / options.limit),
            currentPage: options.page,
        },
    };
};

export const deleteMovieById = async (id: string) => {
    const movie = await db.query.movies.findFirst({
        where: eq(movies.id, id),
        with: {
            video: {
                with: {
                    versions: true,
                },
            },
        },
    });

    if (!movie || !movie.video) throw new MovieNotFoundError();
    const video = movie.video;

    if (video.status === 'processing') throw new AppError('Wait until video is processed', { statusCode: 403 });

    if (video.status === 'downloading') throw new AppError('Wait until video is downloaded', { statusCode: 403 });

    for (const version of video.versions) {
        if (version.status === 'processing') {
            await taskRegistry.kill(version.id).catch(() => {});
        } else if (version.status === 'waiting') {
            taskHandler.cancel(version.id);
        }
    }

    const videoDir = path.resolve(paths.storage, 'videos', video.id);
    await fs.rm(videoDir, { recursive: true, force: true }).catch(() => {});
    await db.delete(videos).where(eq(videos.id, video.id));
};

export const updateMovieById = async (id: string, data: Partial<VideoMetadata>): Promise<MovieDetailedDTO> => {
    await db.transaction(async (tx) => {
        const modified = await tx
            .update(movies)
            .set({
                title: data.title,
                overview: data.overview,
                releaseYear: data.releaseYear,
                rating: data.rating?.toString() ?? null,
                bannerUrl: data.bannerUrl,
                posterUrl: data.posterUrl,
            })
            .where(eq(movies.id, id));

        if (modified.rowCount === 0) throw new MovieNotFoundError();

        if (data.genres) {
            const genreIds = await getGenreIds(data.genres);
            await tx.delete(moviesToGenres).where(eq(moviesToGenres.movieId, id));

            if (genreIds.length > 0) {
                const values = genreIds.map((genreId) => ({ movieId: id, genreId: genreId }));
                await tx
                    .insert(moviesToGenres)
                    .values(values)
                    .catch(async (err) => {
                        throw new AppError('Database insert failed for movie genres', { statusCode: 500, cause: err });
                    });
            }
        }
    });

    return getMovieById(id);
};

export const getMovieById = async (id: string, options: { userId: string | null } = { userId: null }): Promise<MovieDetailedDTO> => {
    const result = await db.query.movies.findFirst({
        where: eq(movies.id, id),
        with: {
            genres: {
                with: {
                    genre: true,
                },
            },
            video: {
                with: {
                    versions: true,
                    subtitles: true,
                    uploader: {
                        columns: {
                            id: true,
                            name: true,
                            role: true,
                            system: true,
                        },
                    },
                },
            },
        },
    });

    if (!result) throw new MovieNotFoundError();

    let inLibrary: boolean | null = null;
    if (options.userId) {
        const [libraryCount] = await db
            .select({ value: count() })
            .from(libraries)
            .leftJoin(libraryItems, eq(libraries.id, libraryItems.libraryId))
            .where(and(eq(libraries.type, 'watchlist'), eq(libraries.userId, options.userId), eq(libraryItems.movieId, id)));

        inLibrary = !!libraryCount?.value && libraryCount?.value > 0;
    }

    return toMovieDetailedDTO(result, inLibrary);
};

export const getFeatured = async (options: { userId: string | null } = { userId: null }) => {
    // internal logic to find featured movie...
    const featured = await db.query.movies.findFirst({
        where: isNotNull(movies.bannerUrl),
        with: {
            video: {
                with: {
                    versions: {
                        where: and(eq(videoVersions.status, 'ready'), eq(videoVersions.isOriginal, true)),
                        columns: { id: true },
                    },
                },
            },
        },
        orderBy: desc(movies.createdAt),
    });

    if (!featured) return null;

    return getMovieById(featured.id, options);
};

export const recordWatchStart = async (_movieId: string, _userId: string) => {};
