import type { SortOrder, SortValue } from '@duckflixapp/shared';

export type SearchOptions = {
    q: string | null;
    page: number;
    limit: number;
    sort: [SortValue, SortOrder];
    genres: string[];
};

export type SearchContentRow = {
    type: string;
    id: string;
    title: string;
    image: string | null;
    rating: number | null;
    createdAt: string;
    release: string;
};

export type SearchResult = {
    results: SearchContentRow[];
    total: number;
};

export interface SearchRepository {
    unifiedSearch(options: SearchOptions): Promise<SearchResult>;
}
