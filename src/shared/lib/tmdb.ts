import axios from 'axios';
import type { TMDBMovieDetails } from '../types/tmdb';
import { AppError } from '../errors';

export class TMDBMovieDetailsError extends AppError {
    constructor(err: unknown) {
        super('Could not fetch TMDB API', { statusCode: 500, cause: err });
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
}
