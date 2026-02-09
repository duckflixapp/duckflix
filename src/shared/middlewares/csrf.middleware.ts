import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';

class CSRFError extends AppError {
    constructor(message: string = 'Invalid CSRF token') {
        super(message, 403);
    }
}

export const csrfGuard = (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    const cookieToken = req.cookies['csrf_token'];
    const headerToken = req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken) throw new CSRFError('Missing CSRF token');
    if (cookieToken !== headerToken) throw new CSRFError();

    next();
};
