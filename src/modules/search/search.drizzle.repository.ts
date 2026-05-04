import { and, asc, count, desc, eq, exists, inArray, sql, type AnyColumn } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/sqlite-core';

import { db } from '@shared/configs/db';
import { movieGenres, movies, moviesToGenres, series, seriesGenres, seriesToGenres } from '@shared/schema';
import type { SearchRepository } from './search.ports';

interface SortableTable {
    title: AnyColumn;
    overview: AnyColumn;
    rating: AnyColumn;
    createdAt: AnyColumn;
    releaseYear?: AnyColumn;
    firstAirDate?: AnyColumn;
}

const searchFromQuery = (table: SortableTable, q: string | null) => {
    if (!q) return { filter: undefined, rank: sql`1` };

    const searchTerm = `%${q.toLowerCase()}%`;

    const filter = sql`(lower(${table.title}) LIKE ${searchTerm} OR lower(coalesce(${table.overview}, '')) LIKE ${searchTerm})`;
    const rank = sql`(CASE WHEN lower(${table.title}) LIKE ${searchTerm} THEN 1 ELSE 0 END)`;

    return { filter, rank };
};

const toSeriesGenresFilter = (genres: string[]) => {
    if (!genres.length) return undefined;
    return exists(
        db
            .select()
            .from(seriesToGenres)
            .innerJoin(seriesGenres, eq(seriesToGenres.genreId, seriesGenres.id))
            .where(and(eq(seriesToGenres.seriesId, series.id), inArray(seriesGenres.name, genres)))
    );
};

const toMovieGenresFilter = (genres: string[]) => {
    if (!genres.length) return undefined;
    return exists(
        db
            .select()
            .from(moviesToGenres)
            .innerJoin(movieGenres, eq(moviesToGenres.genreId, movieGenres.id))
            .where(and(eq(moviesToGenres.movieId, movies.id), inArray(movieGenres.name, genres)))
    );
};

export const drizzleSearchRepository: SearchRepository = {
    async unifiedSearch(options) {
        const offset = (options.page - 1) * options.limit;

        const { filter: textFilterSeries, rank: rankSeries } = searchFromQuery(series, options.q);
        const { filter: textFilterMovies, rank: rankMovies } = searchFromQuery(movies, options.q);

        const filtersSeries = and(textFilterSeries, toSeriesGenresFilter(options.genres));
        const filtersMovies = and(textFilterMovies, toMovieGenresFilter(options.genres));

        return db.transaction(async (tx) => {
            const moviesPart = tx
                .select({
                    type: sql<string>`'movie'`.as('type'),
                    id: movies.id,
                    title: movies.title,
                    image: movies.posterUrl,
                    rating: movies.rating,
                    createdAt: movies.createdAt,
                    release: sql<string>`coalesce(cast(${movies.releaseYear} as text), '')`.as('release'),
                    rank: rankMovies.as('rank'),
                })
                .from(movies)
                .where(filtersMovies);

            const seriesPart = tx
                .select({
                    type: sql<string>`'series'`.as('type'),
                    id: series.id,
                    title: series.title,
                    image: series.posterUrl,
                    rating: series.rating,
                    createdAt: series.createdAt,
                    release: sql<string>`coalesce(substr(${series.firstAirDate}, 1, 4), '')`.as('release'),
                    rank: rankSeries.as('rank'),
                })
                .from(series)
                .where(filtersSeries);

            const combinedQuery = unionAll(moviesPart, seriesPart).as('combined_results');

            const [totalCountResult] = await tx.select({ value: count() }).from(combinedQuery);

            const total = totalCountResult?.value ?? 0;
            if (total === 0) return { results: [], total };

            const sortOrderFn = options.sort[1] === 'asc' ? asc : desc;
            let unionOrder;

            if (options.sort[0] === 'title') unionOrder = sortOrderFn(combinedQuery.title);
            else if (options.sort[0] === 'rating') unionOrder = sortOrderFn(combinedQuery.rating);
            else if (options.sort[0] === 'release') unionOrder = sortOrderFn(combinedQuery.release);
            else unionOrder = sortOrderFn(combinedQuery.createdAt);

            const orderBy = options.q ? [desc(combinedQuery.rank), unionOrder] : [unionOrder];

            const results = await tx
                .select()
                .from(combinedQuery)
                .orderBy(...orderBy)
                .limit(options.limit)
                .offset(offset);

            return { results, total };
        });
    },
};
