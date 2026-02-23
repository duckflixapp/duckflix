import type { Request } from 'express';
import cors from 'cors';
import { env } from 'bun';

export const corsConfiguration = cors((req: Request, callback) => {
    const requestOrigin = req.headers.origin;

    if ((!requestOrigin || requestOrigin === 'https://www.gstatic.com') && req.path.includes('/media/')) {
        callback(null, { origin: '*', credentials: false });
        return;
    }

    callback(null, { origin: env.ORIGIN, credentials: true });
});
