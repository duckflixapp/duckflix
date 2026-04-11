import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { videoVersions, subtitles } from '@schema/video.schema';
import { AppError } from '@shared/errors';
import { paths } from '@shared/configs/path.config';
import { sessionClient } from './session/session.client';
import type { Context } from 'elysia';

export const handleStream = async ({ params, query, set }: Context) => {
    const { versionId, file } = params;
    const { session } = query;

    const version = await db.query.videoVersions.findFirst({
        where: eq(videoVersions.id, versionId!),
    });

    if (!version) throw new AppError('Video version not found', { statusCode: 404 });

    await sessionClient.validate(session!, version.videoId);

    const absolutePlaylistPath = path.resolve(paths.storage, version.storageKey);
    const directoryPath = path.dirname(absolutePlaylistPath);
    const requestedFile = version.mimeType === 'application/x-mpegURL' ? file || 'index.m3u8' : path.basename(version.storageKey);
    const finalFilePath = path.join(directoryPath, requestedFile);

    const bunFile = Bun.file(finalFilePath);
    if (!(await bunFile.exists())) {
        throw new AppError('Media file not found', { statusCode: 404 });
    }

    if (requestedFile.endsWith('.m3u8')) set.headers['content-type'] = 'application/x-mpegURL';
    else if (requestedFile.endsWith('.ts')) set.headers['content-type'] = 'video/MP2T';
    else if (version.mimeType) set.headers['content-type'] = version.mimeType;

    return bunFile;
};

export const handleSubtitle = async ({ params, query }: Context) => {
    const { subtitleId } = params;
    const { session } = query;

    const subtitle = await db.query.subtitles.findFirst({
        where: eq(subtitles.id, subtitleId!),
    });

    if (!subtitle) throw new AppError('Subtitle not found', { statusCode: 404 });

    await sessionClient.validate(session!, subtitle.videoId);

    const absolutePath = path.resolve(paths.storage, subtitle.storageKey);
    const bunFile = Bun.file(absolutePath);

    if (!(await bunFile.exists())) {
        throw new AppError('Subtitle not found on storage', { statusCode: 404 });
    }

    return bunFile;
};
