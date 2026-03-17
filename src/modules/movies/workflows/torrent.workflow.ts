import path from 'node:path';
import fs from 'node:fs/promises';
import { db } from '../../../shared/configs/db';
import { TorrentDownloadError } from '../movies.errors';
import type { DownloadProgress } from '@duckflix/shared';
import { paths } from '../../../shared/configs/path.config';
import { AppError } from '../../../shared/errors';
import { TorrentClient, validateTorrentFileSize } from '../../../shared/utils/torrent';
import { RqbitClient } from '../../../shared/lib/rqbit';
import { emitMovieProgress } from '../movies.handler';
import { notifyJobStatus } from '../../../shared/services/notification.service';
import { env } from '../../../env';
import { logger } from '../../../shared/configs/logger';
import { movies } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { processVideoWorkflow } from './video.workflow';

const rqbitClient = new RqbitClient({ baseUrl: env.RQBIT_URL! });
const torrentClient = new TorrentClient({ rqbit: rqbitClient });

export const processTorrentFileWorkflow = async (data: {
    userId: string;
    movieId: string;
    movieTitle: string;
    torrentPath: string;
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

    torrent.addListener('progress', (progress) => emitMovieProgress(data.movieId, 'downloading', progress as DownloadProgress));

    torrent.addListener('error', ({ error, code }) => {
        logger.debug(
            {
                err: error,
                errorCode: code,
                movieId: data.movieId,
                context: 'torrent_client',
            },
            'Torrent download status error'
        );
    });

    try {
        logger.info({ movieId: data.movieId }, 'Torrent waiting for download...');
        notifyJobStatus(data.userId, 'started', `Movie started downloading`, data.movieTitle, data.movieId).catch(() => {});
        await torrent.waitDownload();
        logger.info({ movieId: data.movieId }, 'Torrent download finished...');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        fs.rm(torrent.dir, { recursive: true, force: true }).catch(() => {});
        throw new TorrentDownloadError(err);
    }

    try {
        await db.update(movies).set({ status: 'processing' }).where(eq(movies.id, data.movieId));
        notifyJobStatus(data.userId, 'downloaded', `Movie downloaded`, `Movie download completed. Processing...`, data.movieId).catch(
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
        safePath = path.join(paths.downloads, `${data.movieId}-torrent${ext}`);
        await fs.rename(downloadedPath, safePath);
    } catch (e) {
        throw new AppError('Video could not be copied after downloading', { cause: e });
    } finally {
        await fs.rm(torrent.dir, { recursive: true, force: true }).catch(() => {});
        torrent.destroy().catch(() => {}); // ignore error
    }

    await processVideoWorkflow({
        userId: data.userId,
        movieId: data.movieId,
        tempPath: safePath,
        originalName: mainFile.name,
        fileSize: mainFile.length,
        imdbId: data.imdbId,
    });
};
