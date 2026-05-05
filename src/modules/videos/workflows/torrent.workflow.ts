import path from 'node:path';
import fs from 'node:fs/promises';
import { paths } from '@shared/configs/path.config';
import { AppError } from '@shared/errors';
import { TorrentCanceledError, TorrentClient, validateTorrentFileSize } from '@utils/torrent';
import { RqbitClient } from '@shared/lib/rqbit';
import { env } from '@core/env';
import { TorrentDownloadError } from '../video.errors';
import type { VideoProcessorContext } from '../imports/video-processor.ports';
import type { DownloadProgress } from '@duckflixapp/shared';

const rqbitClient = new RqbitClient({ baseUrl: env.RQBIT_URL! });
const torrentClient = new TorrentClient({ rqbit: rqbitClient });

export const processTorrentFileWorkflow = async (data: { torrentPath: string }, context: VideoProcessorContext) => {
    let torrentBuffer: Buffer;
    try {
        const valid = await validateTorrentFileSize(data.torrentPath);
        if (!valid) throw new AppError('Torrent file is too large', { statusCode: 400 });

        torrentBuffer = await fs.readFile(data.torrentPath);
    } catch (err) {
        throw err;
    } finally {
        await fs.unlink(data.torrentPath).catch(() => {});
    }

    await fs.mkdir(paths.downloads, { recursive: true });

    const torrent = await torrentClient.download(torrentBuffer).catch((e) => {
        throw new TorrentDownloadError(e);
    });
    context.download.register(torrent);

    torrent.addListener('progress', (progress) =>
        context.emit({ type: 'progress', phase: 'downloading', progress: progress satisfies DownloadProgress })
    );

    torrent.addListener('error', ({ error, code }) =>
        context.emit({
            type: 'log',
            level: 'debug',
            message: 'Torrent download status error',
            data: {
                err: error,
                errorCode: code,
                context: 'torrent_client',
            },
        })
    );

    try {
        context.emit({
            type: 'log',
            level: 'info',
            message: 'Torrent waiting for download...',
        });
        context.emit({
            type: 'status',
            status: 'started',
            title: 'Download started',
            message: `Torrent started downloading video`,
        });
        await torrent.waitDownload();
        context.emit({
            type: 'log',
            level: 'info',
            message: 'Torrent download finished...',
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        fs.rm(torrent.dir, { recursive: true, force: true }).catch(() => {});
        if (err instanceof TorrentCanceledError) {
            context.emit({
                type: 'status',
                status: 'canceled',
                title: `Video download canceled`,
                message: `Torrent download was canceled.`,
            });
            throw err;
        }
        throw new TorrentDownloadError(err);
    } finally {
        context.download.unregister();
    }

    try {
        context.emit({
            type: 'status',
            status: 'downloaded',
            title: `Video downloaded`,
            message: `Video download completed. Processing...`,
        });
    } catch (e) {
        await fs.rm(torrent.dir, { recursive: true, force: true }).catch(() => {});
        torrent.destroy().catch(() => {});
        throw new AppError('Error changing video status and notifying', { cause: e });
    }

    let safePath, mainFile;
    try {
        mainFile = torrent.files.reduce((p, c) => (p.length > c.length ? p : c));
        const downloadedPath = path.join(torrent.dir, mainFile.name);

        const ext = path.extname(mainFile.name);
        safePath = path.join(paths.downloads, `${crypto.randomUUID()}-torrent${ext}`);
        await fs.rename(downloadedPath, safePath);
    } catch (e) {
        throw new AppError('Video could not be copied after downloading', { cause: e });
    } finally {
        await fs.rm(torrent.dir, { recursive: true, force: true }).catch(() => {});
        torrent.destroy().catch(() => {}); // ignore error
    }

    return { path: safePath, name: mainFile.name, size: mainFile.length };
};
