import axios from 'axios';
import { AppError } from '../errors';
import type { DownloadSubResponse, SearchSubsResponse, SubtitleData } from '../types/opensubs';

export class OpenSubsError extends AppError {
    constructor(err: unknown) {
        super('Could not fetch OpenSubtitles API', { statusCode: 500, cause: err });
    }
}

export class OpenSubtitlesClient {
    private api;
    private tokenExpiry: number | null = null;
    private username?: string;
    private password?: string;
    private useLogin: boolean = false;

    private providedBaseUrl: string | undefined;
    constructor(options: { baseUrl: string; apiKey: string; username?: string; password?: string; login?: boolean }) {
        const appName = 'Duckflix',
            appVersion = '1.0';
        this.api = axios.create({
            baseURL: options.baseUrl,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'Api-Key': options.apiKey,
                'User-Agent': `${appName} v${appVersion}`,
            },
        });
        this.providedBaseUrl = options.baseUrl;
        this.username = options.username;
        this.password = options.password;
        this.useLogin = options.login ?? false;
    }

    private async login() {
        if (this.tokenExpiry && this.tokenExpiry > Date.now() + 60000) return;
        const { data } = await this.api.post<{ status: number; base_url?: string; token?: string }>(
            '/login',
            {
                username: this.username,
                password: this.password,
            },
            {
                baseURL: this.providedBaseUrl,
            }
        );
        if (data.status < 200 || data.status >= 300) throw new OpenSubsError(new Error('Unauthorized'));
        this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;

        this.api.defaults.baseURL = `https://${data.base_url!}/api/v1`;
        this.api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    }

    public async getSubtitles(
        imdbId: string,
        options?: {
            languages?: string[];
            movieHash?: string;
            page?: number;
        },
        further: number = 1
    ): Promise<SubtitleData[]> {
        if (this.useLogin) await this.login();
        const languagesString = options?.languages ? options?.languages.sort().join(',') : undefined;
        const { data } = await this.api
            .get<SearchSubsResponse>(`/subtitles`, {
                params: {
                    type: 'movie',
                    order_by: 'ratings',
                    order_direction: 'desc',
                    imdb_id: imdbId,
                    languages: languagesString,
                    moviehash: options?.movieHash,
                    moviehash_match: options?.movieHash ? 'only' : undefined,
                    page: options?.page,
                },
            })
            .catch((err) => {
                throw new OpenSubsError(err);
            });
        const results = data.data;
        if (further > 0 && data.page < data.total_pages) {
            const furtherData = await this.getSubtitles(imdbId, { ...options, page: data.page + 1 }, further - 1).catch(() => []);
            results.push(...furtherData);
        }
        return results;
    }

    public async downloadSubtitle(fileId: number, options?: { sub_format?: 'srt' | 'vtt' }) {
        if (this.useLogin) await this.login();
        const { data } = await this.api
            .post<DownloadSubResponse>(`/download`, {
                file_id: fileId,
                sub_format: options?.sub_format,
            })
            .catch((err) => {
                throw new OpenSubsError(err);
            });

        return data;
    }
}
