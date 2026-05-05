import { limits } from '@shared/configs/limits.config';
import { AppError } from '@shared/errors';
import type { VideoProcessor } from '../video-processor.ports';
import { identifyVideoWorkflow } from '@modules/videos/workflows/identify.workflow';

export const uploaderProcessor: VideoProcessor = {
    id: 'uploader',
    builtIn: true,
    initialStatus: 'processing',
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

    async identify({ source, requestedType }) {
        if (source.sourceType !== 'file') return null;

        return identifyVideoWorkflow({
            filePath: source.tempPath,
            fileName: source.file.name,
            type: requestedType,
        });
    },

    async start({ source }) {
        if (source.sourceType !== 'file') throw new AppError('Uploader processor only supports file sources', { statusCode: 400 });

        // do nothing, just pass parameters
        return { fileName: source.file.name, fileSize: source.file.size, path: source.tempPath };
    },
};
