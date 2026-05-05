import path from 'node:path';
import { AppError } from '@shared/errors';
import { appendSessionToHlsManifest, resolveMediaStoragePath } from './media.helpers';
import type { MediaFile, MediaFileStore, MediaPaths, MediaRepository, MediaSessionClient } from './media.ports';

export interface MediaServiceDependencies {
    mediaRepository: MediaRepository;
    sessionClient: MediaSessionClient;
    fileStore: MediaFileStore;
    paths: Pick<MediaPaths, 'storage'>;
}

export interface MediaResponse {
    body: string | MediaFile;
    contentType?: string;
}

export const createMediaService = ({ mediaRepository, sessionClient, fileStore, paths }: MediaServiceDependencies) => {
    const stream = async (data: { versionId: string; file?: string; session: string }): Promise<MediaResponse> => {
        const version = await mediaRepository.findVideoVersion(data.versionId);
        if (!version) throw new AppError('Video version not found', { statusCode: 404 });

        await sessionClient.validate(data.session, version.videoId);

        const requestedFile =
            version.mimeType === 'application/x-mpegURL' ? (data.file ?? 'index.m3u8') : path.basename(version.storageKey);
        const filePath = resolveMediaStoragePath(paths.storage, version.storageKey, requestedFile);
        const file = fileStore.file(filePath);

        if (!(await file.exists())) {
            throw new AppError('Media file not found', { statusCode: 404 });
        }

        if (requestedFile.endsWith('.m3u8')) {
            return {
                body: appendSessionToHlsManifest(await file.text(), data.session),
                contentType: 'application/x-mpegURL',
            };
        }

        return {
            body: file,
            contentType: requestedFile.endsWith('.ts') ? 'video/MP2T' : (version.mimeType ?? undefined),
        };
    };

    const subtitle = async (data: { subtitleId: string; session: string }): Promise<MediaResponse> => {
        const subtitle = await mediaRepository.findSubtitle(data.subtitleId);
        if (!subtitle) throw new AppError('Subtitle not found', { statusCode: 404 });

        await sessionClient.validate(data.session, subtitle.videoId);

        const file = fileStore.file(resolveMediaStoragePath(paths.storage, subtitle.storageKey));

        if (!(await file.exists())) {
            throw new AppError('Subtitle not found on storage', { statusCode: 404 });
        }

        return { body: file };
    };

    return { stream, subtitle };
};

export type MediaService = ReturnType<typeof createMediaService>;
