import path from 'node:path';
import { Elysia } from 'elysia';
import { paths } from '@shared/configs/path.config';
import { AppError } from '@shared/errors';

const publicRoot = path.resolve(paths.public);

export const assetsRouter = new Elysia().get('/assets/*', async ({ params, set }) => {
    const requestedPath = params['*'];
    if (!requestedPath) throw new AppError('Asset not found', { statusCode: 404 });

    const filePath = path.resolve(publicRoot, requestedPath);
    if (filePath === publicRoot || !filePath.startsWith(publicRoot + path.sep)) {
        throw new AppError('Asset not found', { statusCode: 404 });
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) throw new AppError('Asset not found', { statusCode: 404 });

    set.headers['cache-control'] = 'public, max-age=31536000, immutable';
    return file;
});
