import type { VideoMetadata, VideoType } from '@shared/services/metadata/metadata.service';
import { identifyMovie } from './identify/movie.strategy';

type IdentifyStrategy<T extends VideoMetadata> = (filePath: string, fileName: string | undefined, checkHash: boolean) => Promise<T>;

const identifyStrategies: {
    [K in VideoType]: IdentifyStrategy<Extract<VideoMetadata, { type: K }>>;
} = {
    movie: identifyMovie,
};

export const identifyVideoWorkflow = async (
    data: { filePath: string; fileName?: string; type?: VideoType },
    options = { checkHash: true }
): Promise<VideoMetadata> => {
    const type = data.type ?? 'movie';
    const strategy = identifyStrategies[type];
    return strategy(data.filePath, data.fileName, options.checkHash);
};
