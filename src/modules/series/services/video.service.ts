import { paths } from '@shared/configs/path.config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '@shared/configs/logger';

export const deleteVideosById = async (videoIds: string[]) => {
    return Promise.all(
        videoIds.map(async (videoId) => {
            const videoPath = path.join(paths.storage, 'videos', videoId);
            try {
                await fs.rm(videoPath, { recursive: true, force: true });
            } catch {
                logger.error({ videoId, path: videoPath }, 'Failed to delete video');
            }
        })
    );
};
