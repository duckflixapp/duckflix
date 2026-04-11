import axios from 'axios';
import { AppError } from '@shared/errors';
import type { DownloadSubResponse, SearchSubsResponse, SubtitleData } from '@shared/types/opensubs';
import { systemSettings } from '@shared/services/system.service';
import { env } from '@core/env';
import type { SystemSettingsT } from '@shared/schema';
import { logger } from '@shared/configs/logger';

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

    public updateCredentials(apiKey: string, username: string, password: string, login: boolean): boolean {
        if (
            this.api.defaults.headers['Api-Key'] === apiKey &&
            this.username === username &&
            this.password === password &&
            this.useLogin === login
        )
            return false;

        this.api.defaults.headers['Api-Key'] = apiKey;
        this.username = username;
        this.password = password;
        this.useLogin = login;
        return true;
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
        options?: {
            type?: 'movie' | 'episode' | 'all';
            imdbId?: string;
            tmdbId?: number;
            fileId?: number;
            parentImdbId?: string;
            languages?: string[];
            movieHash?: string;
            page?: number;
            orderBy?: string;
        },
        further: number = 1
    ): Promise<SubtitleData[]> {
        if (this.useLogin) await this.login();
        const languagesString = options?.languages ? options?.languages.sort().join(',') : undefined;
        const { data } = await this.api
            .get<SearchSubsResponse>(`/subtitles`, {
                params: {
                    type: options?.type,
                    order_by: options?.orderBy ?? 'downloads',
                    order_direction: 'desc',
                    imdb_id: options?.imdbId,
                    tmdb_id: options?.tmdbId,
                    parent_imdb_id: options?.parentImdbId,
                    languages: languagesString,
                    moviehash: options?.movieHash,
                    moviehash_match: options?.movieHash ? 'only' : undefined,
                    file_id: options?.fileId,
                    page: options?.page,
                },
            })
            .catch((err) => {
                throw new OpenSubsError(err);
            });
        const results = data.data;
        if (further > 0 && data.page < data.total_pages) {
            const furtherData = await this.getSubtitles({ ...options, page: data.page + 1 }, further - 1).catch(() => []);
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

const sysSettings = await systemSettings.get();
export const subtitlesClient = new OpenSubtitlesClient({
    baseUrl: env.OPENSUBS_URL,
    apiKey: sysSettings.external.openSubtitles.apiKey,
    username: sysSettings.external.openSubtitles.username,
    password: sysSettings.external.openSubtitles.password,
    login: sysSettings.external.openSubtitles.useLogin,
});

systemSettings.addListener('update', (settings: SystemSettingsT) => {
    const openSubtitles = settings.external.openSubtitles;
    if (!subtitlesClient.updateCredentials(openSubtitles.apiKey, openSubtitles.username, openSubtitles.password, openSubtitles.useLogin))
        return;
    logger.info({ context: 'external_api', service: 'opensubtitles' }, 'OpenSubtitles credentials updated successfully');
});
