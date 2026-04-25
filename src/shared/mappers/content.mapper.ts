import type { ContentDTO } from '@duckflixapp/shared';
import type { Movie } from '@schema/movie.schema';
import type { Series } from '@shared/schema';

export const toContentDTO = (type: 'movie' | 'series', item: Movie | Series): ContentDTO => ({
    type,
    id: item.id,
    title: item.title,
    image: item.posterUrl ?? null,
    rating: item.rating ? item.rating : null,
    createdAt: item.createdAt,
    release: type === 'movie' ? ((item as Movie).releaseYear?.toString() ?? '') : ((item as Series).firstAirDate?.slice(0, 4) ?? ''),
});

export const toContentDTOFromRow = (row: {
    type: string;
    id: string;
    title: string;
    image: string | null;
    rating: number | null;
    createdAt: string;
    release: string;
}): ContentDTO => ({
    type: row.type as 'movie' | 'series',
    id: row.id,
    title: row.title,
    image: row.image,
    rating: row.rating ? row.rating : null,
    createdAt: row.createdAt,
    release: row.release,
});
