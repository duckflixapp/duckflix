import type { Request } from "express";
import cors from 'cors';
import { env } from "bun";

export const corsConfiguration = cors((req: Request, callback) => {
    if (req.path.includes('/media/')) {
        callback(null, { origin: '*' });
        return;
    }
    
    callback(null, { origin: env.ORIGIN, credentials: true })
});
