import path from 'node:path';
import { AppError } from '@shared/errors';

export const appendSessionToHlsManifest = (content: string, session: string) =>
    content.replace(/^(?!#)(.+\.(ts|m3u8|vtt|aac|mp4)(\?.*)?)$/gm, (match) => {
        const separator = match.includes('?') ? '&' : '?';
        return `${match}${separator}session=${session}`;
    });

export const resolveMediaStoragePath = (storageRoot: string, storageKey: string, requestedFile?: string) => {
    const absoluteStoragePath = path.resolve(storageRoot, storageKey);
    const directoryPath = path.dirname(absoluteStoragePath);
    const fileName = requestedFile ?? path.basename(storageKey);

    if (path.isAbsolute(fileName) || fileName.includes('/') || fileName.includes('\\') || fileName === '..' || fileName.includes('..')) {
        throw new AppError('Invalid media file path', { statusCode: 400 });
    }

    const filePath = path.resolve(directoryPath, fileName);
    const directoryWithSeparator = directoryPath.endsWith(path.sep) ? directoryPath : `${directoryPath}${path.sep}`;

    if (!filePath.startsWith(directoryWithSeparator)) {
        throw new AppError('Invalid media file path', { statusCode: 400 });
    }

    return filePath;
};
