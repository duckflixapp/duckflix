import { AppError } from '@shared/errors';
import type { EpisodeMetadata, MovieMetadata } from '../metadata.types';
import { tmdbClient } from '@shared/lib/tmdb';

// ----- IMDB ID -----
export const fillFromIMDBId = async (imdbId: string) => {
    const response = await tmdbClient.findByExternalId(imdbId, 'imdb_id');
    if (response.movie_results[0]) {
        const movie = response.movie_results[0];
        if (!movie.id) throw new AppError('TMDB Movie not found', { statusCode: 404 });
        return fillMovieFromTMDBId(String(movie.id));
    }

    if (response.tv_episode_results[0]) {
        const ep = response.tv_episode_results[0];
        if (!ep.show_id) throw new AppError('TMDB Episode not found', { statusCode: 404 });
        return fillEpisodeFromTMDBIds(ep.show_id, ep.season_number, ep.episode_number);
    }

    throw new AppError('IMDB Id not found', { statusCode: 404 });
};

// ----- TMDB URL -----
const parseIdsFromUrl = (
    url: string
): { type: 'movie'; id: string } | { type: 'episode'; seriesId: number; seasonNumber: number; episodeNumber: number } => {
    const movieMatch = url.match(/themoviedb\.org\/movie\/(\d+)/);
    if (movieMatch && movieMatch[1]) return { type: 'movie', id: movieMatch[1] };

    const episodeMatch = url.match(/themoviedb\.org\/tv\/(\d+).*?\/season\/(\d+)\/episode\/(\d+)/);
    if (episodeMatch && episodeMatch[1] && episodeMatch[2] && episodeMatch[3])
        return {
            type: 'episode',
            seriesId: parseInt(episodeMatch[1]),
            seasonNumber: parseInt(episodeMatch[2]),
            episodeNumber: parseInt(episodeMatch[3]),
        };

    throw new AppError('Invalid TMDB URL', { statusCode: 400 });
};

export const fillFromTMDBUrl = async (url: string): Promise<MovieMetadata | EpisodeMetadata | null> => {
    const data = parseIdsFromUrl(url);
    const type = data.type;

    if (type === 'movie') return fillMovieFromTMDBId(data.id);
    if (type === 'episode') return fillEpisodeFromTMDBIds(data.seriesId, data.seasonNumber, data.episodeNumber);

    return null;
};

// ------------------------------------
// Episodes
// ------------------------------------
export const fillEpisodeFromTMDBIds = async (seriesId: number, seasonNumber: number, episodeNumber: number): Promise<EpisodeMetadata> => {
    const raw = await tmdbClient.getEpisodeDetails(seriesId, seasonNumber, episodeNumber, { append: 'external_ids' });

    return {
        type: 'episode',
        name: raw.name,
        overview: raw.overview,
        airDate: new Date(raw.air_date),
        runtime: raw.runtime,
        stillUrl: raw.still_path ? `https://image.tmdb.org/t/p/original${raw.still_path}` : undefined,
        rating: raw.vote_average,
        imdbId: raw.external_ids?.imdb_id ?? null,
        tmdbShowId: Number(seriesId),
        seasonNumber,
        episodeNumber,
    };
};

// ------------------------------------
// Movies
// ------------------------------------
export const fillMovieFromTMDBId = async (id: string): Promise<MovieMetadata> => {
    const raw = await tmdbClient.getMovieDetails(id);

    const rawGenres = raw.genres.map(({ name }) => name.toLowerCase());

    return {
        type: 'movie',
        title: raw.title || raw.original_title,
        overview: raw.overview,
        releaseYear: new Date(raw.release_date).getFullYear(),
        posterUrl: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : undefined,
        bannerUrl: raw.backdrop_path ? `https://image.tmdb.org/t/p/original${raw.backdrop_path}` : undefined,
        genres: rawGenres,
        rating: raw.vote_average,
        runtime: raw.runtime,
        imdbId: raw.imdb_id,
        tmdbId: Number(raw.id),
    };
};

export const searchTMDB = async (data: {
    title: string;
    year?: number;
    primary_release_year?: number;
    language?: string;
    adult?: boolean;
    region?: string;
    page?: number;
}) => {
    return tmdbClient.searchMovies(data.title, data);
};
