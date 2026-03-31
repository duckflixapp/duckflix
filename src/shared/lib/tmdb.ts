import axios, { AxiosError } from 'axios';
import type { TMDBFindByExternalIdResponse, TMDBMovieDetails, TMDBSearchResponse } from '@shared/types/movie.tmdb';
import { AppError } from '@shared/errors';
import type { TMDBEpisodeDetails, TMDBSeasonDetails, TMDBSeriesDetails } from '@shared/types/series.tmdb';
import { systemSettings } from '@shared/services/system.service';
import { env } from '@core/env';
import type { SystemSettingsT } from '@schema/system.schema';
import { logger } from '@shared/configs/logger';

export class TMDBMovieDetailsError extends AppError {
    constructor(err: unknown) {
        super('Could not fetch TMDB Movies API', { statusCode: 500, cause: err });
    }
}

export class TMDBFindExternalError extends AppError {
    constructor(err: unknown) {
        super('Could not fetch TMDB Find API', { statusCode: 500, cause: err });
    }
}

export class TMDBSearchError extends AppError {
    constructor(err: unknown) {
        super('Could not fetch TMDB Search API', { statusCode: 500, cause: err });
    }
}

export class TMDBGenresError extends AppError {
    constructor(err: unknown) {
        super('Could not fetch TMDB Genres API', { statusCode: 500, cause: err });
    }
}

export class TMDBEpisodeDetailsError extends AppError {
    constructor(err: unknown) {
        super('Could not fetch TMDB TV Episode API', { statusCode: 500, cause: err });
    }
}

export class TMDBClient {
    private readonly api;
    private apiKey;
    constructor(options: { baseUrl: string; apiKey: string }) {
        this.api = axios.create({
            baseURL: options?.baseUrl,
            headers: {
                accept: 'application/json',
                Authorization: `Bearer ${options.apiKey}`,
            },
        });
        this.apiKey = options.apiKey;
    }

    public updateCredentials(apiKey: string): boolean {
        if (this.apiKey === apiKey) return false;
        this.apiKey = apiKey;
        this.api.defaults.headers['Authorization'] = `Bearer ${apiKey}`;
        return true;
    }

    // ----- External IDs -----
    public async findByExternalId(externalId: string, source: 'imdb_id', language: string = 'en-US') {
        const { data } = await this.api
            .get<TMDBFindByExternalIdResponse>(`/find/${externalId}`, {
                params: {
                    external_source: source,
                    language,
                },
            })
            .catch((err) => {
                throw new TMDBFindExternalError(err);
            });
        return data;
    }

    // ----- TV Series -----
    public async getEpisodeDetails(seriesId: number, seasonNumber: number, episodeNumber: number, options?: { append: 'external_ids' }) {
        const { data } = await this.api
            .get<TMDBEpisodeDetails>(`/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}`, {
                params: {
                    append_to_response: options?.append,
                },
            })
            .catch((err) => {
                if (err instanceof AxiosError && err.response?.status === 404)
                    throw new AppError('Could not find episode on TMDB', { statusCode: 404 });
                throw new TMDBEpisodeDetailsError(err);
            });
        return data;
    }

    public async getSeasonDetails(seriesId: number, seasonNumber: number, options?: { append: 'external_ids' }) {
        const { data } = await this.api
            .get<TMDBSeasonDetails>(`/tv/${seriesId}/season/${seasonNumber}`, {
                params: {
                    append_to_response: options?.append,
                },
            })
            .catch((err) => {
                if (err instanceof AxiosError && err.response?.status === 404)
                    throw new AppError('Could not find season on TMDB', { statusCode: 404 });

                throw new TMDBEpisodeDetailsError(err);
            });
        return data;
    }

    public async getSeriesDetails(seriesId: number, options?: { append: 'external_ids' }) {
        const { data } = await this.api
            .get<TMDBSeriesDetails>(`/tv/${seriesId}`, {
                params: {
                    append_to_response: options?.append,
                },
            })
            .catch((err) => {
                if (err instanceof AxiosError && err.response?.status === 404)
                    throw new AppError('Could not find tv series on TMDB', { statusCode: 404 });
                throw new TMDBEpisodeDetailsError(err);
            });
        return data;
    }

    public async getTVGenres(options?: { language?: string }) {
        const { data } = await this.api
            .get<{ genres: { id: number; name: string }[] }>('/genre/tv/list', { params: { language: options?.language } })
            .catch((err) => {
                throw new TMDBGenresError(err);
            });
        return data;
    }

    // ----- Movies -----
    public async getMovieDetails(movieId: string) {
        const { data } = await this.api.get<TMDBMovieDetails>(`/movie/${movieId}`).catch((err) => {
            throw new TMDBMovieDetailsError(err);
        });
        return data;
    }

    public async searchMovies(
        query: string,
        options: { year?: number; primary_release_year?: number; language?: string; adult?: boolean; region?: string; page?: number }
    ) {
        const { data } = await this.api
            .get<TMDBSearchResponse>(`/search/movie`, {
                params: {
                    query,
                    year: options.year,
                    primary_release_year: options.primary_release_year,
                    region: options.region,
                    include_adult: options.adult,
                    language: options.language,
                    page: options.page,
                },
            })
            .catch((err) => {
                throw new TMDBSearchError(err);
            });
        return data;
    }

    public async getMovieGenres(options?: { language?: string }) {
        const { data } = await this.api
            .get<{ genres: { id: number; name: string }[] }>('/genre/movie/list', { params: { language: options?.language } })
            .catch((err) => {
                throw new TMDBGenresError(err);
            });
        return data;
    }
}

const sysSettings = await systemSettings.get();
export const tmdbClient = new TMDBClient({ baseUrl: env.TMDB_URL, apiKey: sysSettings.external.tmdb.apiKey });

systemSettings.addListener('update', (settings: SystemSettingsT) => {
    const updated = tmdbClient.updateCredentials(settings.external.tmdb.apiKey);
    if (!updated) return;
    logger.info({ context: 'external_api', service: 'tmdb' }, 'TMDB API Key updated successfully without restart');
});
