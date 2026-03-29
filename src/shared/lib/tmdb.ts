import axios from 'axios';
import type { TMDBFindByExternalIdResponse, TMDBMovieDetails, TMDBSearchResponse } from '@shared/types/tmdb';
import { AppError } from '@shared/errors';

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

    public async getMovieGenres(options?: { language?: string }) {
        const { data } = await this.api
            .get<{ genres: { id: number; name: string }[] }>('/genre/movie/list', { params: { language: options?.language } })
            .catch((err) => {
                throw new TMDBGenresError(err);
            });
        return data;
    }
}
