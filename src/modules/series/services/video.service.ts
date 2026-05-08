import { paths } from '@shared/configs/path.config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '@shared/configs/logger';

export const deleteVideosById = async (videoIds: string[], subtitles: { id: string; storageKey: string }[]) => {
    return Promise.all([
        ...videoIds.map(async (videoId) => {
            const videoPath = path.join(paths.storage, 'videos', videoId);
            try {
                await fs.rm(videoPath, { recursive: true, force: true });
            } catch {
                logger.error({ id: videoId, path: videoPath }, 'Failed to delete video');
            }
        }),
        ...subtitles.map(async (subtitle) => {
            const subtitlePath = path.join(paths.storage, subtitle.storageKey);
            try {
                await fs.rm(subtitlePath, { recursive: true, force: true });
            } catch {
                logger.error({ id: subtitle.id, path: subtitlePath }, 'Failed to delete subtitle');
            }
        }),
    ]);
};
