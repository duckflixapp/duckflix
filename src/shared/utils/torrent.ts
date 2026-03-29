import fs from 'node:fs/promises';
import type { RqbitTorrent, TorrentStats } from '@shared/types/torrent';
import { EventEmitter } from 'node:events';
import type { RqbitClient } from '@shared/lib/rqbit';
import { AppError } from '@shared/errors';
import path from 'node:path';
import { paths } from '@shared/configs/path.config';
import type { DownloadProgress } from '@duckflix/shared';

const defaultMaxSize = 1024 * 1024 * 2; // 2MB
export const validateTorrentFileSize = async (torrentPath: string, maxSize: number = defaultMaxSize) => {
    const stats = await fs.stat(torrentPath);

    return stats.size < maxSize;
};

class TorrentError extends AppError {
    constructor(name: string, err?: unknown) {
        super(name, { statusCode: 500, cause: err });
    }
}

export class Torrent extends EventEmitter {
    private timeoutId: NodeJS.Timeout | null = null;

    constructor(
        private readonly client: TorrentClient,
        private readonly data: RqbitTorrent
    ) {
        super();
    }

    public get id() {
        return this.data.id;
    }

    public get dir() {
        const rqbitPath = this.data.output_folder;
        const folderName = path.basename(rqbitPath);

        return path.join(paths.downloads, folderName);
    }

    public get files() {
        return this.data.details.files;
    }

    public async checkProgress(): Promise<{ stats: TorrentStats; progress: number }> {
        const stats = await this.client.stats(this.id);
        const progress = stats.total_bytes > 0 ? stats.progress_bytes / stats.total_bytes : 0;
        const peers = stats.live?.snapshot.peer_stats;

        this.emit('progress', {
            percent: Number((progress * 100).toFixed(2)),
            speed: stats.live?.download_speed.human_readable ?? '0 B/s',
            eta: stats.live?.time_remaining?.human_readable ?? 'N/A',
            peers: {
                active: peers?.live ?? 0,
                total: peers?.seen ?? 0,
                connecting: peers?.connecting ?? 0,
            },
        } as DownloadProgress);

        return { stats, progress };
    }

    public async waitDownload(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.timeoutId) return reject(new Error('Already waiting download for this torrent'));

            let errorCount = 0;
            const timeout = async () => {
                try {
                    const { stats, progress } = await this.checkProgress().catch((err) => {
                        if (errorCount > 0) throw err;
                        this.emit('error', {
                            error: err,
                            code: 'PROGRESS_INTRV_CHECK',
                        });
                        return { stats: null, progress: 0 };
                    });
                    if (!stats) {
                        errorCount++;
                        this.timeoutId = setTimeout(timeout, 1000); // on check error
                        return;
                    }
                    errorCount = 0;

                    if (stats.finished || progress >= 1) {
                        this.stopTracking();
                        return resolve();
                    }

                    if (stats.state === 'error') {
                        this.stopTracking();
                        const error = stats.error ? new Error(stats.error) : undefined;
                        return reject(new TorrentError('rqbit reported a torrent error', error));
                    }

                    this.timeoutId = setTimeout(timeout, 1000);
                } catch (err) {
                    this.stopTracking();
                    reject(new TorrentError('unexpected torrent error', err));
                }
            };

            this.timeoutId = setTimeout(timeout, 1000);
        });
    }

    private stopTracking() {
        if (this.timeoutId) clearTimeout(this.timeoutId);
        this.timeoutId = null;
    }

    public destroy() {
        this.stopTracking();
        this.removeAllListeners('progress');
        this.removeAllListeners('error');
        return this.client.remove(this.id);
    }
}

export class TorrentClient {
    private readonly rqbit;
    constructor(options: { rqbit: RqbitClient }) {
        this.rqbit = options.rqbit;
    }

    public async download(torrentFile: Buffer) {
        const data = await this.rqbit.torrentDownload(torrentFile);
        const torrent = new Torrent(this, data);
        return torrent;
    }

    public async remove(torrentId: number) {
        return this.rqbit.torrentDelete(torrentId);
    }

    public async stats(torrentId: number) {
        return this.rqbit.torrentStats(torrentId);
    }
}
