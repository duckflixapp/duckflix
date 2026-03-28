import { parseIdFromUrl } from './providers/imdb.provider';
import { fillFromIMDBId, fillFromTMDBUrl } from './providers/tmdb.provider';
import type { CreateVideoInput } from '../../modules/videos/video.validator';
import type { UpdateMovieInput } from '../../modules/movies/validators/movies.validator';

export interface MovieMetadata {
    type: 'movie';
    title: string;
    overview?: string | null;
    releaseYear?: number | null;
    posterUrl?: string | null;
    bannerUrl?: string | null;
    genres: string[];
    imdbId: string | null;
    rating: number | null;
}

// export interface TVEpisodeMetadata {
//     type: 'episode';
//     name: string;
//     overview?: string | null;
//     airDate: string;
//     rating: number | null;
//     stillUrl?: string | null;
//     seasonId: string;
// }

export type VideoMetadata = MovieMetadata; // | TVEpisodeMetadata;

export const fillFromUrl = async (url: string): Promise<Partial<MovieMetadata> | null> => {
    if (url.includes('themoviedb.org/movie')) return await fillFromTMDBUrl(url);
    if (url.includes('imdb.com/title')) {
        const imdbId = parseIdFromUrl(url);
        return await fillFromIMDBId(imdbId);
    }
    return null;
};

type MetadataEnricher<TInput, TOutput extends VideoMetadata> = (url: string | undefined | null, manual: TInput) => Promise<TOutput | null>;
export type VideoType = keyof typeof metadataEnrichers;

const enrichMovieMetadata: MetadataEnricher<CreateVideoInput, MovieMetadata> = async (url, manual) => {
    let external: Partial<MovieMetadata> = {};

    if (url) {
        const partial = await fillFromUrl(url);
        if (partial) external = partial;
    }

    if (!external.title && !manual.title) return null;

    const metadata: MovieMetadata = {
        type: 'movie',
        title: external.title || manual.title!,
        overview: external.overview ?? manual.overview ?? '',
        releaseYear: external.releaseYear ?? manual.releaseYear ?? new Date().getFullYear(),
        posterUrl: external.posterUrl ?? manual.posterUrl,
        bannerUrl: external.bannerUrl ?? manual.bannerUrl,
        genres: external.genres?.length ? external.genres : (manual.genreIds ?? []),
        imdbId: external.imdbId ?? null,
        rating: external.rating ?? null,
    };

    return metadata;
};

export const metadataEnrichers = {
    movie: enrichMovieMetadata,
} as const;

type MetadataUpdateEnricher<TInput, TOutput extends VideoMetadata> = (
    url: string | undefined | null,
    manual: TInput
) => Promise<Partial<TOutput> | null>;

const enrichMovieUpdateMetadata: MetadataUpdateEnricher<UpdateMovieInput, MovieMetadata> = async (url, manual) => {
    let external: Partial<MovieMetadata> = {};

    if (url) {
        const partial = await fillFromUrl(url);
        if (partial) external = partial;
    }

    const result: Partial<MovieMetadata> = {};

    if (external.title || manual.title) result.title = external.title || manual.title!;
    if (external.overview ?? manual.overview) result.overview = external.overview ?? manual.overview;
    if (external.releaseYear ?? manual.releaseYear) result.releaseYear = external.releaseYear ?? manual.releaseYear;
    if (external.posterUrl ?? manual.posterUrl) result.posterUrl = external.posterUrl ?? manual.posterUrl;
    if (external.bannerUrl ?? manual.bannerUrl) result.bannerUrl = external.bannerUrl ?? manual.bannerUrl;
    if (external.genres?.length || manual.genres?.length) result.genres = external.genres?.length ? external.genres : manual.genres;
    if (external.imdbId) result.imdbId = external.imdbId;
    if (external.rating) result.rating = external.rating;

    return Object.keys(result).length > 0 ? result : null;
};

export const metadataUpdateEnrichers = {
    movie: enrichMovieUpdateMetadata,
} as const;
