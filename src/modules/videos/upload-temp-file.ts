import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError } from '@shared/errors';
import { paths } from '@shared/configs/path.config';

const MAX_SAFE_NAME_LENGTH = 120;

export const sanitizeUploadFileName = (name: string) => {
    const baseName = path.basename(name.replaceAll('\\', '/'));
    const safeName = baseName
        .normalize('NFKC')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^\.+/, '')
        .slice(0, MAX_SAFE_NAME_LENGTH);

    return safeName || 'upload';
};

export const saveUploadToTemp = async (file: File, targetDir = paths.uploads) => {
    const uploadDir = path.resolve(targetDir);
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = sanitizeUploadFileName(file.name);
    const filePath = path.resolve(uploadDir, `${randomUUID()}-${safeName}`);
    const uploadRoot = uploadDir.endsWith(path.sep) ? uploadDir : `${uploadDir}${path.sep}`;

    if (!filePath.startsWith(uploadRoot)) {
        throw new AppError('Invalid upload file path', { statusCode: 400 });
    }

    try {
        await pipeline(Readable.fromWeb(file.stream()), createWriteStream(filePath, { flags: 'wx' }));
    } catch (e) {
        await fs.unlink(filePath).catch(() => {});
        throw e;
    }

    return filePath;
};
