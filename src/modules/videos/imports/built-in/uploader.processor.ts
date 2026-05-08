import { limits } from '@shared/configs/limits.config';
import { AppError } from '@shared/errors';
import type { BuiltInVideoProcessor } from '../video-processor.ports';
import { identifyVideoWorkflow } from '@modules/videos/workflows/identify.workflow';

export const uploaderProcessor: BuiltInVideoProcessor = {
    id: 'uploader',
    builtIn: true,
    initialStatus: 'processing',
    permissions: ['filesystem:job'],
    sourceTypes: ['file'],

    validateSource(source) {
        if (source.sourceType !== 'file') throw new AppError('Uploader processor only supports file sources', { statusCode: 400 });

        if (source.file.size > limits.file.upload * 1024 * 1024) {
            throw new AppError('Video file exceeds maximum allowed size.', { statusCode: 400 });
        }

        const isValidMime = source.file.type.startsWith('video/') || source.file.type === 'application/octet-stream';
        if (!isValidMime) {
            throw new AppError('Only video files (mp4, mkv, avi, mov) are allowed', { statusCode: 400 });
        }
    },

    async identify({ source, requestedType, dbUrl }) {
        if (source.sourceType !== 'file') return null;

        return identifyVideoWorkflow({
            filePath: source.tempPath,
            fileName: source.file.name,
            type: requestedType,
            dbUrl,
        });
    },

    async scan({ source, requestedType }) {
        return [{ id: 'default', source, requestedType }];
    },

    async start({ items }) {
        const [item] = items;
        if (!item) throw new AppError('Uploader processor requires one video item', { statusCode: 500 });
        const source = item.source;
        if (source.sourceType !== 'file') throw new AppError('Uploader processor only supports file sources', { statusCode: 400 });

        // do nothing, just pass parameters
        return [{ id: item.id, fileName: source.file.name, fileSize: source.file.size, path: source.tempPath }];
    },
};
