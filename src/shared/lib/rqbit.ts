import axios from 'axios';
import type { RqbitTorrent, TorrentStats } from '@shared/types/torrent';
import { AppError } from '@shared/errors';

export class RqbitNewTorrentError extends AppError {
    constructor(code: number) {
        super('Torrent not added.', { statusCode: code });
    }
}

export class RqbitStatsError extends AppError {
    constructor(code: number) {
        super('Torrent stats not retrieved.', { statusCode: code });
    }
}

export class RqbitRemoveError extends AppError {
    constructor(code: number) {
        super('Torrent stats not retrieved.', { statusCode: code });
    }
}

export class RqbitClient {
    private readonly api;
    constructor(options?: { baseUrl: string }) {
        const baseUrl = options?.baseUrl ?? 'http://localhost:3030';
        this.api = axios.create({ baseURL: baseUrl, responseType: 'json' });
    }

    public async torrentDownload(torrentFile: Buffer): Promise<RqbitTorrent> {
        const { data: torrent } = await this.api
            .post<RqbitTorrent>(`/torrents`, torrentFile, {
                params: { overwrite: true },
                headers: { 'Content-Type': 'application/x-bittorrent' },
            })
            .catch((err) => {
                const statusCode = err.response?.status ?? 500;
                throw new RqbitNewTorrentError(statusCode);
            });
        return torrent;
    }

    public async torrentDelete(torrentId: number): Promise<void> {
        await this.api.post(`/torrents/${torrentId}/delete`).catch((err) => {
            const statusCode = err.response?.status ?? 500;
            throw new RqbitRemoveError(statusCode);
        });
    }

    public async torrentStats(torrentId: number): Promise<TorrentStats> {
        const { data: stats } = await this.api.get<TorrentStats>(`/torrents/${torrentId}/stats/v1`).catch((err) => {
            const statusCode = err.response?.status ?? 500;
            throw new RqbitStatsError(statusCode);
        });
        return stats;
    }
}
