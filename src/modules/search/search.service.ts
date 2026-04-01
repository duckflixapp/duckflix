import type { MovieMinDTO, PaginatedResponse, SeriesMinDTO } from '@duckflix/shared';
import { toMovieMinDTO } from '@shared/mappers/movies.mapper';
import { movies } from '@schema/movie.schema';
import { series } from '@schema/series.schema';
import { and, asc, count, desc, eq, sql, type AnyColumn } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { videos } from '@shared/schema';
import { toSeriesMinDTO } from '@shared/mappers/series.mapper';
import type { SORT_ORDER_VALUES, SORT_VALUES } from './search.validator';

type SortValue = (typeof SORT_VALUES)[number];
type SortOrder = (typeof SORT_ORDER_VALUES)[number];

interface SearchOptions {
    q: string | null;
    page: number;
    limit: number;
    sort: [SortValue, SortOrder];
}

interface SortableTable {
    title: AnyColumn;
    overview: AnyColumn;
    rating: AnyColumn;
    createdAt: AnyColumn;
    releaseYear?: AnyColumn;
    firstAirDate?: AnyColumn;
}

const orderFromSort = (table: SortableTable, sort: SortValue, order: SortOrder) => {
    const fn = order === 'asc' ? asc : desc;
    if (sort === 'title') return fn(table.title);
    if (sort === 'rating') return fn(table.rating);
    if (sort === 'date') return fn(table.createdAt);
    if (sort === 'release') {
        if (table.releaseYear) return fn(table.releaseYear);
        if (table.firstAirDate) return fn(table.firstAirDate);
    }
    return fn(table.createdAt);
};

const searchFromQuery = (table: SortableTable, q: string | null) => {
    if (!q) return { filter: undefined, rank: sql`1` };

    const document = sql`setweight(to_tsvector('english', ${table.title}), 'A') || 
                         setweight(to_tsvector('english', coalesce(${table.overview}, '')), 'B')`;

    const query = sql`plainto_tsquery('english', ${q})`;

    const filter = sql`${document} @@ ${query}`;
    const rank = sql`ts_rank(${document}, ${query})`;
    return { filter, rank };
};

export const searchSeries = async (options: SearchOptions): Promise<PaginatedResponse<SeriesMinDTO>> => {
    const offset = (options.page - 1) * options.limit;

    const { filter, rank } = searchFromQuery(series, options.q);
    const order = orderFromSort(series, ...options.sort);

    const orderBy = options.q ? [desc(rank), order] : [order]; // seems like with rank 1 drizzle will ignore order?

    const { total, results } = await db.transaction(async (tx) => {
        const [total] = await tx.select({ value: count() }).from(series).where(filter);
        if (!total?.value) return { results: [], total: 0 };

        const results = await tx
            .select()
            .from(series)
            .where(filter)
            .orderBy(...orderBy)
            .limit(options.limit)
            .offset(offset);

        return { results, total: total.value };
    });

    return {
        data: results.map(toSeriesMinDTO),
        meta: {
            totalItems: total,
            itemCount: results.length,
            itemsPerPage: options.limit,
            totalPages: Math.ceil(total / options.limit),
            currentPage: options.page,
        },
    };
};

export const searchMovies = async (options: SearchOptions): Promise<PaginatedResponse<MovieMinDTO>> => {
    const offset = (options.page - 1) * options.limit;

    const { filter, rank } = searchFromQuery(movies, options.q);
    const filterJoin = and(eq(videos.id, movies.videoId), eq(videos.status, 'ready'));
    const order = orderFromSort(movies, ...options.sort);

    const orderBy = options.q ? [desc(rank), order] : [order];

    const { total, results } = await db.transaction(async (tx) => {
        const [total] = await tx.select({ value: count() }).from(movies).innerJoin(videos, filterJoin).where(filter);
        if (!total?.value) return { results: [], total: 0 };

        const results = await tx
            .select({ movie: movies })
            .from(movies)
            .innerJoin(videos, filterJoin)
            .where(filter)
            .orderBy(...orderBy)
            .limit(options.limit)
            .offset(offset);

        return { results, total: total.value };
    });

    return {
        data: results.map((r) => toMovieMinDTO(r.movie)),
        meta: {
            totalItems: total,
            itemCount: results.length,
            itemsPerPage: options.limit,
            totalPages: Math.ceil(total / options.limit),
            currentPage: options.page,
        },
    };
};
