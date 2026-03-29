import { AppError } from '../../../../shared/errors';
import { TMDBClient } from '../../../../shared/lib/tmdb';
import { env } from '../../../../env';
import { systemSettings } from '../../../../shared/services/system.service';
import type { SystemSettingsT } from '../../../../shared/schema';
import { logger } from '../../../../shared/configs/logger';
import type { MovieMetadata } from '../metadata.service';
import type { VideoType } from '@duckflix/shared';

const sysSettings = await systemSettings.get();
const tmdbClient = new TMDBClient({ baseUrl: env.TMDB_URL, apiKey: sysSettings.external.tmdb.apiKey });
systemSettings.addListener('update', (settings: SystemSettingsT) => {
    const updated = tmdbClient.updateCredentials(settings.external.tmdb.apiKey);
    if (!updated) return;
    logger.info({ context: 'external_api', service: 'tmdb' }, 'TMDB API Key updated successfully without restart');
});

const parseIdFromUrl = (url: string): { id: string; type: VideoType } => {
    const movieMatch = url.match(/themoviedb\.org\/movie\/(\d+)/);
    if (movieMatch && movieMatch[1]) return { id: movieMatch[1], type: 'movie' };
    throw new AppError('Invalid TMDB URL', { statusCode: 400 });
};

export const fillFromTMDBUrl = async (url: string) => {
    const { id, type } = parseIdFromUrl(url);

    if (type == 'movie') return fillMovieFromTMDBId(id);
    return null;
};

export const fillFromIMDBId = async (imdbId: string) => {
    const response = await tmdbClient.findByExternalId(imdbId, 'imdb_id');
    const movie = response.movie_results[0];
    if (!movie || !movie.id) throw new AppError('TMDB Movie not found', { statusCode: 404 });

    return fillMovieFromTMDBId(String(movie.id));
};

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
        imdbId: raw.imdb_id,
        rating: raw.vote_average,
    };
};

export const getTMDBMovieGenres = async () => {
    const { genres } = await tmdbClient.getMovieGenres();
    const genreNames = genres.map(({ name }) => name.toLowerCase());
    return genreNames;
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
