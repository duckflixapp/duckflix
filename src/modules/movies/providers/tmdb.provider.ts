import { AppError } from '../../../shared/errors';
import { TMDBClient } from '../../../shared/lib/tmdb';
import { getGenreIds } from '../services/genres.service';
import type { VideoMetadata } from '../services/metadata.service';
import { env } from '../../../env';
import { getSystemSettings } from '../../../shared/services/system.service';

const systemSettings = await getSystemSettings();
const tmdbClient = new TMDBClient({ baseUrl: env.TMDB_URL, apiKey: systemSettings.external.tmdb.apiKey });

export const fillFromTMDBUrl = async (url: string): Promise<Partial<VideoMetadata>> => {
    const id = parseIdFromUrl(url);
    if (!id) throw new AppError('Invalid tmdb url', { statusCode: 400 });

    const raw = await tmdbClient.getMovieDetails(id);

    const rawGenres = raw.genres.map(({ name }) => name.toLowerCase());
    const genreIds = await getGenreIds(rawGenres);

    return {
        title: raw.title || raw.original_title,
        overview: raw.overview,
        releaseYear: new Date(raw.release_date).getFullYear(),
        posterUrl: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : undefined,
        bannerUrl: raw.backdrop_path ? `https://image.tmdb.org/t/p/original${raw.backdrop_path}` : undefined,
        genreIds,
        imdbId: raw.imdb_id,
        rating: raw.vote_average,
    };
};

const parseIdFromUrl = (url: string): string | null => {
    const movieMatch = url.match(/themoviedb\.org\/movie\/(\d+)/);
    if (movieMatch) return movieMatch[1] ?? null;
    return null;
};
