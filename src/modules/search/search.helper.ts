import { and, type AnyColumn, asc, desc, eq, exists, inArray, sql } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { seriesToGenres, seriesGenres, series, movieGenres, movies, moviesToGenres } from '@shared/schema';
import type { SortOrder, SortValue } from '@duckflixapp/shared';

interface SortableTable {
    title: AnyColumn;
    overview: AnyColumn;
    rating: AnyColumn;
    createdAt: AnyColumn;
    releaseYear?: AnyColumn;
    firstAirDate?: AnyColumn;
}

export const orderFromSort = (table: SortableTable, sort: SortValue, order: SortOrder) => {
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

export const searchFromQuery = (table: SortableTable, q: string | null) => {
    if (!q) return { filter: undefined, rank: sql`1` };

    const searchTerm = `%${q.toLowerCase()}%`;

    const filter = sql`(lower(${table.title}) LIKE ${searchTerm} OR lower(coalesce(${table.overview}, '')) LIKE ${searchTerm})`;
    const rank = sql`(CASE WHEN lower(${table.title}) LIKE ${searchTerm} THEN 1 ELSE 0 END)`;

    return { filter, rank };
};

export const toSeriesGenresFilter = (genres: string[]) => {
    if (!genres.length) return undefined;
    return exists(
        db
            .select()
            .from(seriesToGenres)
            .innerJoin(seriesGenres, eq(seriesToGenres.genreId, seriesGenres.id))
            .where(and(eq(seriesToGenres.seriesId, series.id), inArray(seriesGenres.name, genres)))
    );
};

export const toMovieGenresFilter = (genres: string[]) => {
    if (!genres.length) return undefined;
    return exists(
        db
            .select()
            .from(moviesToGenres)
            .innerJoin(movieGenres, eq(moviesToGenres.genreId, movieGenres.id))
            .where(and(eq(moviesToGenres.movieId, movies.id), inArray(movieGenres.name, genres)))
    );
};
