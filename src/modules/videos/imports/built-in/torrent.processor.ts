import { AppError } from '@shared/errors';
import type { VideoProcessor, VideoProcessorStartOutput } from '../video-processor.ports';
import { identifyVideoWorkflow } from '@modules/videos/workflows/identify.workflow';
import { processTorrentFileWorkflow } from '@modules/videos/workflows/torrent.workflow';

export const torrentProcessor: VideoProcessor = {
    id: 'torrent',
    builtIn: true,
    initialStatus: 'downloading',
    sourceTypes: ['file', 'text'],
    validateSource: (source): Promise<void> | void => {
        if (source.sourceType === 'file') {
            if (source.file.size > 5 * 1024 * 1024) {
                throw new AppError('Torrent file is suspiciously large', { statusCode: 400 });
            }

            const isTorrentMime = source.file.type === 'application/x-bittorrent';
            const isTorrentExt = source.file.name.toLowerCase().endsWith('.torrent');

            if (!isTorrentMime && !isTorrentExt) {
                throw new AppError('The "torrent" field must contain a .torrent file.', { statusCode: 400 });
            }
        }
    },

    async identify({ source, requestedType }) {
        if (source.sourceType !== 'file') return null;

        return identifyVideoWorkflow(
            {
                filePath: source.tempPath,
                fileName: source.file.name,
                type: requestedType,
            },
            { checkHash: false }
        );
    },

    start: async ({ source }, context): Promise<VideoProcessorStartOutput> => {
        if (source.sourceType !== 'file') throw new Error('download from updated is not supported yet');
        const { name, path, size } = await processTorrentFileWorkflow({ torrentPath: source.tempPath }, context);

        return { fileName: name, fileSize: size, path };
    },
};
