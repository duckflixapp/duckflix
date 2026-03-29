import path from 'node:path';
import fs from 'node:fs/promises';
import { db } from '../../../shared/configs/db';
import type { DownloadProgress } from '@duckflix/shared';
import { paths } from '../../../shared/configs/path.config';
import { AppError } from '../../../shared/errors';
import { TorrentClient, validateTorrentFileSize } from '../../../shared/utils/torrent';
import { RqbitClient } from '../../../shared/lib/rqbit';
import { emitVideoProgress } from '../video.handler';
import { notifyJobStatus } from '../../../shared/services/notifications/notification.helper';
import { env } from '../../../env';
import { logger } from '../../../shared/configs/logger';
import { eq } from 'drizzle-orm';
import { processVideoWorkflow } from './video.workflow';
import { videos } from '../../../shared/schema';
import { TorrentDownloadError } from '../video.errors';

const rqbitClient = new RqbitClient({ baseUrl: env.RQBIT_URL! });
const torrentClient = new TorrentClient({ rqbit: rqbitClient });

export const processTorrentFileWorkflow = async (data: {
    userId: string;
    videoId: string;
    torrentPath: string;
    type: 'movie';
    imdbId: string | null;
}) => {
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

    torrent.addListener('progress', (progress) => emitVideoProgress(data.videoId, 'downloading', progress as DownloadProgress));

    torrent.addListener('error', ({ error, code }) => {
        logger.debug(
            {
                err: error,
                errorCode: code,
                videoId: data.videoId,
                context: 'torrent_client',
            },
            'Torrent download status error'
        );
    });

    try {
        logger.info({ videoId: data.videoId }, 'Torrent waiting for download...');
        notifyJobStatus(data.userId, 'started', `Video started downloading`, data.videoId, data.videoId).catch(() => {});
        await torrent.waitDownload();
        logger.info({ videoId: data.videoId }, 'Torrent download finished...');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        fs.rm(torrent.dir, { recursive: true, force: true }).catch(() => {});
        throw new TorrentDownloadError(err);
    }

    try {
        await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, data.videoId));
        notifyJobStatus(data.userId, 'downloaded', `Video downloaded`, `Video download completed. Processing...`, data.videoId).catch(
            () => {}
        );
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
        safePath = path.join(paths.downloads, `${data.videoId}-torrent${ext}`);
        await fs.rename(downloadedPath, safePath);
    } catch (e) {
        throw new AppError('Video could not be copied after downloading', { cause: e });
    } finally {
        await fs.rm(torrent.dir, { recursive: true, force: true }).catch(() => {});
        torrent.destroy().catch(() => {}); // ignore error
    }

    await processVideoWorkflow({
        userId: data.userId,
        videoId: data.videoId,
        tempPath: safePath,
        originalName: mainFile.name,
        fileSize: mainFile.length,
        type: data.type,
        imdbId: data.imdbId,
    });
};
