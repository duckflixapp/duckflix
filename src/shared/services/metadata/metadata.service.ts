import { parseIdFromUrl } from './providers/imdb.provider';
import { fillEpisodeFromTMDBIds, fillFromIMDBId, fillFromTMDBUrl, fillMovieFromTMDBId } from './providers/tmdb.provider';
import type { CreateEpisodeInput, CreateMovieInput, CreateVideoInput } from '@modules/videos/video.validator';
import type { UpdateMovieInput } from '@modules/movies/validators/movies.validator';
import { episodeMetadataSchema, movieMetadataSchema } from './metadata.validator';
import type { EpisodeMetadata, MovieMetadata, VideoMetadata } from './metadata.types';
import { AppError } from '@shared/errors';
import { tmdbClient } from '@shared/lib/tmdb';

export type SeriesMetadata = {
    type: 'series';
    title: string;
    overview?: string | null;
    posterUrl?: string | null;
    bannerUrl?: string | null;
    genres: string[];
    rating: number | null;
    imdbId: string | null;
    tmdbShowId: number;
    seasonCount: number;
    episodeCount: number;
};

export type SeasonMetadata = {
    type: 'season';
    name: string;
    overview?: string | null;
    airDate?: Date | null;
    posterUrl?: string | null;
    rating: number | null;
    imdbId: string | null;
    tmdbId: number | null;
    tmdbShowId: number;
    seasonNumber: number;
    episodeCount: number;
};

export type MetadataResolveInput = {
    dbUrl: string;
    requestedType?: 'movie' | 'episode';
};

export type MetadataResolveResult = VideoMetadata | SeriesMetadata | SeasonMetadata;

export const fillFromUrl = async (url: string) => {
    if (url.includes('themoviedb.org/')) return await fillFromTMDBUrl(url);
    if (url.includes('imdb.com/title')) {
        const imdbId = parseIdFromUrl(url);
        return await fillFromIMDBId(imdbId);
    }
    return null;
};

const parseTmdbUrl = (url: string) => {
    const movieMatch = url.match(/themoviedb\.org\/movie\/(\d+)/);
    if (movieMatch?.[1]) return { type: 'movie' as const, id: movieMatch[1] };

    const episodeMatch = url.match(/themoviedb\.org\/tv\/(\d+).*?\/season\/(\d+)\/episode\/(\d+)/);
    if (episodeMatch?.[1] && episodeMatch[2] && episodeMatch[3])
        return {
            type: 'episode' as const,
            seriesId: Number(episodeMatch[1]),
            seasonNumber: Number(episodeMatch[2]),
            episodeNumber: Number(episodeMatch[3]),
        };

    const seasonMatch = url.match(/themoviedb\.org\/tv\/(\d+).*?\/season\/(\d+)(?!\/episode)/);
    if (seasonMatch?.[1] && seasonMatch[2])
        return {
            type: 'season' as const,
            seriesId: Number(seasonMatch[1]),
            seasonNumber: Number(seasonMatch[2]),
        };

    const seriesMatch = url.match(/themoviedb\.org\/tv\/(\d+)/);
    if (seriesMatch?.[1]) return { type: 'series' as const, seriesId: Number(seriesMatch[1]) };

    return null;
};

const toImageUrl = (path: string | null | undefined, size: 'w500' | 'original' = 'original') =>
    path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;

export const resolveMetadata = async ({ dbUrl }: MetadataResolveInput): Promise<MetadataResolveResult | null> => {
    if (dbUrl.includes('imdb.com/title')) {
        return fillFromIMDBId(parseIdFromUrl(dbUrl));
    }

    if (!dbUrl.includes('themoviedb.org/')) return null;

    const parsed = parseTmdbUrl(dbUrl);
    if (!parsed) throw new AppError('Invalid TMDB URL', { statusCode: 400 });

    if (parsed.type === 'movie') return fillMovieFromTMDBId(parsed.id);
    if (parsed.type === 'episode') return fillEpisodeFromTMDBIds(parsed.seriesId, parsed.seasonNumber, parsed.episodeNumber);

    if (parsed.type === 'series') {
        const raw = await tmdbClient.getSeriesDetails(parsed.seriesId, { append: 'external_ids' });

        return {
            type: 'series',
            title: raw.name || raw.original_name,
            overview: raw.overview,
            posterUrl: toImageUrl(raw.poster_path, 'w500'),
            bannerUrl: toImageUrl(raw.backdrop_path),
            genres: raw.genres.map(({ name }) => name.toLowerCase()),
            rating: raw.vote_average,
            imdbId: raw.external_ids?.imdb_id ?? null,
            tmdbShowId: raw.id,
            seasonCount: raw.number_of_seasons,
            episodeCount: raw.number_of_episodes,
        };
    }

    const raw = await tmdbClient.getSeasonDetails(parsed.seriesId, parsed.seasonNumber, { append: 'external_ids' });

    return {
        type: 'season',
        name: raw.name,
        overview: raw.overview,
        airDate: raw.air_date ? new Date(raw.air_date) : null,
        posterUrl: toImageUrl(raw.poster_path, 'w500'),
        rating: raw.vote_average,
        imdbId: raw.external_ids?.imdb_id ?? null,
        tmdbId: raw.id ?? null,
        tmdbShowId: parsed.seriesId,
        seasonNumber: raw.season_number,
        episodeCount: raw.episodes.length,
    };
};

// ----- Enrich Episode -----
const enrichEpisodeMetadata = async (external: Partial<EpisodeMetadata>, manual: Partial<CreateEpisodeInput>) => {
    try {
        return episodeMetadataSchema.parse({
            type: 'episode',
            name: external.name || manual.name,
            overview: (external.overview || manual.overview) ?? null,
            airDate: external.airDate ?? null,
            runtime: external.runtime ?? null,
            stillUrl: external.stillUrl ?? null,
            rating: external.rating ?? null,
            imdbId: external.imdbId ?? null,
            tmdbId: external.tmdbId ?? null,
            tmdbShowId: (external.tmdbShowId || manual.seriesId) ?? null,
            seasonNumber: (external.seasonNumber || manual.seasonNumber) ?? null,
            episodeNumber: (external.episodeNumber || manual.episodeNumber) ?? null,
        });
    } catch {
        return null;
    }
};

// ----- Enrich Movie -----
const enrichMovieMetadata = async (external: Partial<MovieMetadata>, manual: Partial<CreateMovieInput>) => {
    try {
        return movieMetadataSchema.parse({
            type: 'movie',
            title: external.title || manual.title,
            overview: external.overview ?? manual.overview ?? '',
            releaseYear: external.releaseYear ?? manual.releaseYear ?? new Date().getFullYear(),
            posterUrl: external.posterUrl ?? manual.posterUrl,
            bannerUrl: external.bannerUrl ?? manual.bannerUrl,
            genres: external.genres?.length ? external.genres : (manual.genres ?? []),
            rating: external.rating ?? null,
            runtime: external.runtime ?? null,
            imdbId: external.imdbId ?? null,
            tmdbId: external.tmdbId ?? null,
        });
    } catch {
        return null;
    }
};

export const enrichMetadata = async (url: string | null | undefined, manual: CreateVideoInput) => {
    let external: Partial<VideoMetadata> = {};

    if (url) {
        const partial = await fillFromUrl(url);
        if (partial) external = partial;
        else throw new AppError('Failed to parse db URL', { statusCode: 400 });
    }

    // Priorities - multiple fn calls for typescript to not make mess
    if (external.type === 'episode' && manual.type === 'episode') return enrichEpisodeMetadata(external, manual);
    if (external.type === 'movie' && manual.type === 'movie') return enrichMovieMetadata(external, manual);
    if (external.type === 'episode') return enrichEpisodeMetadata(external, {});
    if (external.type === 'movie') return enrichMovieMetadata(external, {});
    if (manual.type === 'episode') return enrichEpisodeMetadata({}, manual);
    if (manual.type === 'movie') return enrichMovieMetadata({}, manual);

    return null;
};

// ------------------------------------
// Update
// ------------------------------------
type MetadataUpdateEnricher<TInput, TOutput extends VideoMetadata> = (
    url: string | undefined | null,
    manual: TInput
) => Promise<Partial<TOutput> | null>;

const enrichMovieUpdateMetadata: MetadataUpdateEnricher<UpdateMovieInput, MovieMetadata> = async (url, manual) => {
    let external: Partial<MovieMetadata> = {};

    if (url) {
        const partial = await fillFromUrl(url);
        if (partial && partial.type === 'movie') external = partial;
    }

    const result: Partial<MovieMetadata> = {};

    if (external.title || manual.title) result.title = external.title || manual.title!;
    if (external.overview ?? manual.overview) result.overview = external.overview ?? manual.overview;
    if (external.releaseYear ?? manual.releaseYear) result.releaseYear = external.releaseYear ?? manual.releaseYear;
    if (external.posterUrl ?? manual.posterUrl) result.posterUrl = external.posterUrl ?? manual.posterUrl;
    if (external.bannerUrl ?? manual.bannerUrl) result.bannerUrl = external.bannerUrl ?? manual.bannerUrl;
    if (external.tmdbId) result.tmdbId = external.tmdbId;
    if (external.imdbId) result.imdbId = external.imdbId;
    if (external.rating) result.rating = external.rating;
    if (external.genres?.length || manual.genres?.length)
        result.genres = external.genres?.length ? external.genres : (manual.genres ?? undefined);

    return Object.keys(result).length > 0 ? result : null;
};

export const metadataUpdateEnrichers = {
    movie: enrichMovieUpdateMetadata,
} as const;
