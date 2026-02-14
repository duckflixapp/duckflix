import type { Request, Response } from 'express';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db';
import { movieVersions } from '../../shared/schema';
import { catchAsync } from '../../shared/utils/catchAsync';
import { AppError } from '../../shared/errors';
import { streamParamsSchema } from './media.validator';
import { paths } from '../../shared/configs/path.config';
import { access } from 'node:fs/promises';
import constants from 'node:constants';

export const stream = catchAsync(async (req: Request, res: Response) => {
    const { versionId } = streamParamsSchema.parse(req.params);

    const version = await db.query.movieVersions.findFirst({ where: eq(movieVersions.id, versionId) });

    if (!version) {
        throw new AppError('Video version not found', { statusCode: 404 });
    }

    const absolutePath = path.resolve(paths.storage, version.storageKey);

    await access(absolutePath, constants.F_OK).catch(() => {
        throw new AppError('Video file not found on storage', { statusCode: 404 });
    });

    res.sendFile(absolutePath, (err) => {
        if (err) {
            const errCode = (err as { code?: string }).code;
            const isClientAbort = errCode === 'ECONNABORTED' || errCode === 'ECANCELED' || err.message.toLowerCase().includes('aborted');
            if (isClientAbort) return; // client error
            if (res.headersSent) return;

            console.error('Streaming error:', err);
        }
    });
});
