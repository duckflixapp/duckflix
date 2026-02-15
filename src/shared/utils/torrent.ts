import fs from 'node:fs/promises';
import { AppError } from '../errors';

const defaultMaxSize = 1024 * 1024 * 2; // 2MB
export const validateTorrentSize = async (torrentPath: string, maxSize: number = defaultMaxSize) => {
    const stats = await fs.stat(torrentPath);

    return stats.size < maxSize;
};

export const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const downloadTorrent = (buffer: Buffer, downloadPath: string, onProgress?: (progress: number, speed: number) => void) => {
    return new Promise((resolve, reject) => {
        try {
            // client.add(buffer, { path: downloadPath }, (torrent) => {
            //     const progressHandler = () => {
            //         if (onProgress) onProgress(torrent.progress * 100, torrent.downloadSpeed);
            //     };

            //     torrent.on('download', progressHandler);
            //     torrent.once('done', () => {
            //         torrent.removeListener('download', progressHandler);
            //         resolve(torrent);
            //     });

            //     torrent.once('error', (err) => {
            //         torrent.removeAllListeners();
            //         torrent.destroy();
            //         reject(err);
            //     });
            // });
            reject(new Error('Torrent not implemented'));
        } catch (err) {
            reject(err);
        }
    });
};
