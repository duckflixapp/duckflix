import type { Request, Response, NextFunction } from 'express';
import jwt, { TokenExpiredError } from 'jsonwebtoken';
import { catchAsync } from '../utils/catchAsync';
import { UnauthorizedError } from '../errors';

const JWT_SECRET = process.env.JWT_SECRET!;

export const authenticate = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.auth_token || req.headers.authorization?.split(' ')[1];

    if (!token) throw new UnauthorizedError('No token provided');

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

        req.userId = decoded.userId;

        next();
    } catch (err: unknown) {
        if (err instanceof TokenExpiredError) throw new UnauthorizedError('Expired token');
        throw new UnauthorizedError('Invalid token');
    }
});
