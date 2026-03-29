import type { Request, Response } from 'express';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { videoVersions, subtitles } from '@schema/video.schema';
import { catchAsync } from '@utils/catchAsync';
import { AppError } from '@shared/errors';
import { streamParamsSchema, subtitleParamsSchema } from './media.validator';
import { paths } from '@shared/configs/path.config';
import { access } from 'node:fs/promises';
import constants from 'node:constants';
import { logger } from '@shared/configs/logger';

export const stream = catchAsync(async (req: Request, res: Response) => {
    const { versionId, file } = streamParamsSchema.parse(req.params);

    const version = await db.query.videoVersions.findFirst({ where: eq(videoVersions.id, versionId) });

    if (!version) {
        throw new AppError('Video version not found', { statusCode: 404 });
    }

    const absolutePlaylistPath = path.resolve(paths.storage, version.storageKey);
    const directoryPath = path.dirname(absolutePlaylistPath);

    const requestedFile = version.mimeType === 'application/x-mpegURL' ? file || 'index.m3u8' : path.basename(version.storageKey);
    const finalFilePath = path.join(directoryPath, requestedFile);

    await access(finalFilePath, constants.F_OK).catch(() => {
        throw new AppError('Media file not found', { statusCode: 404 });
    });

    if (requestedFile.endsWith('.m3u8')) res.setHeader('Content-Type', 'application/x-mpegURL');
    else if (requestedFile.endsWith('.ts')) res.setHeader('Content-Type', 'video/MP2T');
    else if (version.mimeType) res.setHeader('Content-Type', version.mimeType);
    else res.setHeader('Content-Type', 'application/octet-stream');

    res.sendFile(finalFilePath, (err) => {
        if (err) {
            const errCode = (err as { code?: string }).code;
            const isClientAbort = errCode === 'ECONNABORTED' || errCode === 'ECANCELED' || err.message.toLowerCase().includes('aborted');
            if (isClientAbort) {
                logger.debug({ path: absolutePlaylistPath, file: requestedFile }, 'Stream aborted by client');
                return; // client error
            }
            if (res.headersSent) return;

            logger.error(
                {
                    err,
                    code: errCode,
                    path: absolutePlaylistPath,
                },
                'Failed to send file'
            );
        }
    });
});

export const subtitle = catchAsync(async (req: Request, res: Response) => {
    const { subtitleId } = subtitleParamsSchema.parse(req.params);

    const subtitle = await db.query.subtitles.findFirst({ where: eq(subtitles.id, subtitleId) });

    if (!subtitle) {
        throw new AppError('Subtitle not found', { statusCode: 404 });
    }

    const absolutePath = path.resolve(paths.storage, subtitle.storageKey);

    await access(absolutePath, constants.F_OK).catch(() => {
        throw new AppError('Subtitle file not found on storage', { statusCode: 404 });
    });

    res.sendFile(absolutePath, (err) => {
        if (err) {
            const errCode = (err as { code?: string }).code;
            const isClientAbort = errCode === 'ECONNABORTED' || errCode === 'ECANCELED' || err.message.toLowerCase().includes('aborted');
            if (isClientAbort) {
                logger.debug({ path: absolutePath }, 'Subtitle aborted by client');
                return; // client error
            }
            if (res.headersSent) return;

            logger.error(
                {
                    err,
                    code: errCode,
                    path: absolutePath,
                },
                'Failed to send subtitle'
            );
        }
    });
});
