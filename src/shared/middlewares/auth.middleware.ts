import type { Request, Response, NextFunction } from 'express';
import { TokenExpiredError } from 'jsonwebtoken';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../errors';
import { csrfGuard } from './csrf.middleware';
import { verifyToken } from '../utils/jwt';

export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized access') {
        super(message, 401);
    }
}

export const authenticate = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.auth_token || req.headers.authorization?.split(' ')[1];

    if (!token) throw new UnauthorizedError('No token provided');

    try {
        const decoded = verifyToken(token) as { userId: string };

        req.userId = decoded.userId;

        csrfGuard(req, res, next); // automatically use csrf guard
    } catch (err: unknown) {
        if (err instanceof TokenExpiredError) throw new UnauthorizedError('Expired token');
        throw new UnauthorizedError('Invalid token');
    }
});
