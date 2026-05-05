import { and, asc, count, desc, eq, exists, ilike, isNotNull, sql } from 'drizzle-orm';

import { db } from '@shared/configs/db';
import { libraries, libraryItems, movies, moviesToGenres, videoVersions } from '@schema/index';
import type { MovieMetadata } from '@shared/services/metadata/metadata.types';
import type { MoviesRepository } from './movies.ports';

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

const richMovieWith = {
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
} as const;

export const drizzleMoviesRepository: MoviesRepository = {
    async list(options) {
        const offset = (options.page - 1) * options.limit;

        const searchFilter = options.search ? ilike(movies.title, `%${options.search}%`) : null;
        const genreFilter = options.genreId
            ? exists(
                  db
                      .select()
                      .from(moviesToGenres)
                      .where(and(eq(moviesToGenres.movieId, movies.id), eq(moviesToGenres.genreId, options.genreId)))
              )
            : null;

        const conditions = [searchFilter, genreFilter];
        const filters = and(...conditions.filter((condition) => condition != null));
        const orderBy = getOrderBy(options.orderBy ?? null);

        const [totalResult, results] = await Promise.all([
            db.select({ value: count() }).from(movies).where(filters),
            db.query.movies.findMany({
                where: filters,
                limit: options.limit,
                offset,
                orderBy,
                with: richMovieWith,
            }),
        ]);

        if (!totalResult[0]) throw new Error('DB Count() failed');

        return {
            results,
            totalItems: Number(totalResult[0].value),
        };
    },

    async updateById(id: string, data: Partial<MovieMetadata>, genreIds?: string[]) {
        return db.transaction(async (tx) => {
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

            if (!modified) return null;

            if (genreIds) {
                await tx.delete(moviesToGenres).where(eq(moviesToGenres.movieId, id));

                if (genreIds.length > 0) {
                    const values = genreIds.map((genreId) => ({ movieId: id, genreId }));
                    await tx.insert(moviesToGenres).values(values);
                }
            }

            return modified;
        });
    },

    async findById(id: string) {
        return (
            (await db.query.movies.findFirst({
                where: eq(movies.id, id),
                with: richMovieWith,
            })) ?? null
        );
    },

    async countInWatchlist(data: { movieId: string; profileId: string }) {
        const result = await db
            .select({ value: count() })
            .from(libraries)
            .leftJoin(libraryItems, eq(libraries.id, libraryItems.libraryId))
            .where(and(eq(libraries.type, 'watchlist'), eq(libraries.profileId, data.profileId), eq(libraryItems.movieId, data.movieId)));

        return result[0]?.value ?? 0;
    },

    async findFeaturedId() {
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

        return featured?.id ?? null;
    },
};
