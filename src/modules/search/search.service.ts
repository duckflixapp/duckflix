import type { PaginatedResponse, ContentDTO, SortOrder, SortValue } from '@duckflixapp/shared';
import { movies } from '@schema/movie.schema';
import { series } from '@schema/series.schema';
import { and, asc, count, desc, sql } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { searchFromQuery, toSeriesGenresFilter, toMovieGenresFilter } from './search.helper';
import { toContentDTOFromRow } from '@shared/mappers/content.mapper';
import { unionAll } from 'drizzle-orm/sqlite-core';

interface SearchOptions {
    q: string | null;
    page: number;
    limit: number;
    sort: [SortValue, SortOrder];
    genres: string[];
}

export const unifiedSearch = async (options: SearchOptions): Promise<PaginatedResponse<ContentDTO>> => {
    const offset = (options.page - 1) * options.limit;

    const { filter: textFilterSeries, rank: rankSeries } = searchFromQuery(series, options.q);
    const { filter: textFilterMovies, rank: rankMovies } = searchFromQuery(movies, options.q);

    const filtersSeries = and(textFilterSeries, toSeriesGenresFilter(options.genres));
    const filtersMovies = and(textFilterMovies, toMovieGenresFilter(options.genres));

    const { total, results } = await db.transaction(async (tx) => {
        const moviesPart = tx
            .select({
                type: sql<string>`'movie'`.as('type'),
                id: movies.id,
                title: movies.title,
                image: movies.posterUrl,
                rating: movies.rating,
                createdAt: movies.createdAt,
                release: sql<string>`coalesce(cast(${movies.releaseYear} as text), '')`.as('release'),
                rank: rankMovies.as('rank'), // Expose rank so we can sort the union by it
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

        const totalCount = totalCountResult?.value ?? 0;
        if (totalCount === 0) return { results: [], total: 0 };

        const sortOrderFn = options.sort[1] === 'asc' ? asc : desc;
        let unionOrder;

        if (options.sort[0] === 'title') unionOrder = sortOrderFn(combinedQuery.title);
        else if (options.sort[0] === 'rating') unionOrder = sortOrderFn(combinedQuery.rating);
        else if (options.sort[0] === 'release') unionOrder = sortOrderFn(combinedQuery.release);
        else unionOrder = sortOrderFn(combinedQuery.createdAt);

        const orderBy = options.q ? [desc(combinedQuery.rank), unionOrder] : [unionOrder];

        const paginatedResults = await tx
            .select()
            .from(combinedQuery)
            .orderBy(...orderBy)
            .limit(options.limit)
            .offset(offset);

        return { results: paginatedResults, total: totalCount };
    });

    return {
        data: results.map(toContentDTOFromRow),
        meta: {
            totalItems: total,
            itemCount: results.length,
            itemsPerPage: options.limit,
            totalPages: Math.ceil(total / options.limit),
            currentPage: options.page,
        },
    };
};
