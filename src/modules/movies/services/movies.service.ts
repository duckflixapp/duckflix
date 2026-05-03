import { and, asc, count, desc, eq, exists, ilike, isNotNull, sql } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { movies, moviesToGenres, videoVersions, libraries, libraryItems } from '@schema/index';
import { MovieNotFoundError } from '../movies.errors';
import type { MovieDetailedDTO, MovieDTO, PaginatedResponse } from '@duckflixapp/shared';
import { toMovieDetailedDTO, toMovieDTO } from '@shared/mappers/movies.mapper';
import { AppError } from '@shared/errors';
import type { MovieMetadata } from '@shared/services/metadata/metadata.types';
import { getMovieGenreIds } from './genres.service';
import { logger } from '@shared/configs/logger';
import { getOrSyncMovieCast, syncMovieCast } from '@shared/services/cast.service';

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
                                email: true,
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

export const updateMovieById = async (id: string, data: Partial<MovieMetadata>): Promise<MovieDetailedDTO> => {
    let tmdbId: number | null = null;
    const shouldSyncCast = typeof data.tmdbId === 'number';

    await db.transaction(async (tx) => {
        const [modified] = await tx
            .update(movies)
            .set({
                title: data.title,
                overview: data.overview,
                releaseYear: data.releaseYear,
                rating: data.rating ?? null,
                bannerUrl: data.bannerUrl,
                posterUrl: data.posterUrl,
                tmdbId: data.tmdbId,
            })
            .where(eq(movies.id, id))
            .returning({ id: movies.id, tmdbId: movies.tmdbId });

        if (!modified) throw new MovieNotFoundError();
        tmdbId = modified.tmdbId;

        if (data.genres) {
            const genreIds = await getMovieGenreIds(data.genres);
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

    if (tmdbId && shouldSyncCast) {
        await syncMovieCast(id, tmdbId).catch((err) => {
            logger.warn({ err, movieId: id, tmdbId }, 'Failed to sync movie cast after update');
        });
    }

    return getMovieById(id);
};

export const getMovieById = async (id: string, options: { profileId: string | null } = { profileId: null }): Promise<MovieDetailedDTO> => {
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
                            email: true,
                            role: true,
                            system: true,
                        },
                    },
                },
            },
        },
    });

    if (!result) throw new MovieNotFoundError();

    const inLibraryPromise = options.profileId
        ? db
              .select({ value: count() })
              .from(libraries)
              .leftJoin(libraryItems, eq(libraries.id, libraryItems.libraryId))
              .where(and(eq(libraries.type, 'watchlist'), eq(libraries.profileId, options.profileId), eq(libraryItems.movieId, id)))
        : Promise.resolve(null);

    const castPromise = getOrSyncMovieCast(result.id, result.tmdbId).catch((err) => {
        logger.warn({ err, movieId: id, tmdbId: result.tmdbId }, 'Failed to load movie cast');
        return [];
    });

    const [libraryCount, cast] = await Promise.all([inLibraryPromise, castPromise]);
    const inLibrary = !!libraryCount?.[0]?.value && libraryCount[0].value > 0;

    return {
        ...toMovieDetailedDTO(result, inLibrary),
        cast,
    };
};

export const getFeatured = async (options: { profileId: string | null } = { profileId: null }) => {
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
