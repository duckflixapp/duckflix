import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../errors';
import { csrfGuard } from './csrf.middleware';
import { verifyToken } from '../utils/jwt';
import type { ExtendedError, Socket } from 'socket.io';
import cookie from 'cookie';

export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized access') {
        super(message, { statusCode: 401 });
    }
}

export class ForbiddenError extends AppError {
    constructor(message: string = 'Forbidden') {
        super(message, { statusCode: 403 });
    }
}

export const isAdmin = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();

    if (req.user.role != 'admin') throw new ForbiddenError();

    next();
});

export const isContributor = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();

    if (req.user.role != 'contributor' && req.user.role != 'admin') throw new ForbiddenError();

    next();
});

export const authenticate = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.auth_token || req.headers.authorization?.split(' ')[1];

    if (!token) throw new UnauthorizedError('No token provided');

    try {
        const decoded = verifyToken(token);

        req.user = {
            id: decoded.userId,
            role: decoded.role,
        };

        csrfGuard(req, res, next); // automatically use csrf guard
    } catch (err: unknown) {
        if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Expired token');
        throw new UnauthorizedError('Invalid token');
    }
});

export const authenticateSocket = async (socket: Socket, next: (err?: ExtendedError | undefined) => unknown) => {
    try {
        const rawCookies = socket.handshake.headers.cookie;
        if (!rawCookies) return next(new Error('Auth error: No cookies'));

        const cookies = cookie.parse(rawCookies);
        const token = cookies['auth_token'];
        if (!token) return next(new Error('Auth error: Token missing'));

        const decoded = verifyToken(token);
        if (!decoded?.userId) return next(new Error('Auth error: Invalid user'));

        socket.data.userId = decoded.userId;
        next();
    } catch (err) {
        next(new Error('Authentication error'));
        console.error('socket auth error', err);
    }
};
