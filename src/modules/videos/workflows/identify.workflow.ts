import type { VideoMetadata } from '@shared/services/metadata/metadata.types';
import { identifyMovie } from './identify/movie.strategy';
import { identifyEpisode } from './identify/episode.strategy';
import { AppError } from '@shared/errors';
import type { VideoType } from '@duckflixapp/shared';
import { logger } from '@shared/configs/logger';
import { ZodError } from 'zod';

export const identifyVideoWorkflow = async (
    data: { filePath: string; fileName?: string; type?: VideoType; dbUrl?: string },
    options = { checkHash: true }
): Promise<VideoMetadata | null> => {
    try {
        if (data.type === 'movie') return await identifyMovie(data.filePath, data.fileName, options.checkHash);
        if (data.type === 'episode') return await identifyEpisode(data.filePath, data.fileName, data.dbUrl);

        throw new AppError('Video type not supported');
    } catch (e) {
        if (!(e instanceof ZodError)) logger.debug({ type: data.type, cause: e }, '[IdentifyVideo] Failed identification');
        return null;
    }
};
