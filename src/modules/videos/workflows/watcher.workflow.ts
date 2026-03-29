import { identifyVideoWorkflow } from './identify.workflow';
import { processVideoWorkflow } from './video.workflow';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '../../../shared/configs/logger';
import { paths } from '../../../shared/configs/path.config';
import chokidar from 'chokidar';
import { handleWorkflowError } from '../video.handler';
import { notifyJobStatus } from '../../../shared/services/notifications/notification.helper';
import { AppError } from '../../../shared/errors';
import { initiateUpload } from '../video.service';

export const processWatcherWorkflow = async (data: { filePath: string; fileName: string; fileSize: number }, systemUserId: string) => {
    const metadata = await identifyVideoWorkflow({ filePath: data.filePath });
    logger.debug({ fileName: data.fileName, metadata }, '[WatcherWorkflow] Identified video');

    const video = await initiateUpload(metadata, {
        userId: systemUserId,
        status: 'processing',
    });

    await processVideoWorkflow({
        type: metadata.type,
        userId: systemUserId,
        videoId: video.id,
        tempPath: data.filePath,
        originalName: data.fileName,
        fileSize: data.fileSize,
        imdbId: metadata.imdbId,
    }).catch((e) => handleWorkflowError(video.id, e, 'video'));
};

const SUPPORTED_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.m4v'];

export const initializeWatcher = async (systemUserId: string) => {
    const dropFolder = paths.drop;
    await fs.mkdir(dropFolder, { recursive: true });

    const watcher = chokidar.watch(dropFolder, {
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: {
            stabilityThreshold: 5000,
            pollInterval: 1000,
        },
        depth: 0, // only root
    });

    watcher.on('add', async (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.includes(ext)) return;

        logger.debug({ filePath }, 'Drop folder: new file detected');

        try {
            const stats = await fs.stat(filePath);
            const fileName = path.basename(filePath);
            const fileSize = stats.size;

            await processWatcherWorkflow({ filePath, fileName, fileSize }, systemUserId);
        } catch (err) {
            let message = '';
            if (err instanceof AppError) message = err.message;
            notifyJobStatus(systemUserId, 'error', 'Dropped video error', message);
            logger.error({ filePath, err }, 'Drop folder: workflow failed');
        }
    });

    watcher.on('error', (err) => logger.error({ err }, 'Drop folder watcher error'));

    logger.debug({ dropFolder }, 'Drop folder watcher initialized');
};
