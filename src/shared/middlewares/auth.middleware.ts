import type { Request, Response, NextFunction } from 'express';
import type { ExtendedError, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { catchAsync } from '@utils/catchAsync';
import { AppError } from '@shared/errors';
import { csrfGuard } from './csrf.middleware';
import { verifyToken } from '@utils/jwt';
import { roleHierarchy, type UserRole } from '@duckflix/shared';

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

export const hasRole = (role: UserRole) => {
    return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) throw new UnauthorizedError();

        if (roleHierarchy[req.user.role] > roleHierarchy[role]) throw new ForbiddenError();

        next();
    });
};

export const authenticate = (verified: boolean = true) => {
    return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        const token = req.cookies.auth_token ?? (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);

        if (!token) throw new UnauthorizedError('No token provided');

        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (err: unknown) {
            if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Expired token');
            throw new UnauthorizedError('Invalid token');
        }

        if (verified && !decoded.isVerified) throw new ForbiddenError('Email not verified');

        req.user = {
            id: decoded.sub,
            role: decoded.role,
            isVerified: decoded.isVerified,
        };

        csrfGuard(req, res, next); // automatically use csrf guard
    });
};

export const authenticateSocket = async (socket: Socket, next: (err?: ExtendedError | undefined) => unknown) => {
    try {
        const rawCookies = socket.handshake.headers.cookie;
        if (!rawCookies) return next(new UnauthorizedError('Auth error: No cookies'));

        const cookies = cookie.parse(rawCookies);
        const token = cookies['auth_token'];
        if (!token) return next(new UnauthorizedError('Auth error: Token missing'));

        const decoded = verifyToken(token);
        socket.data.userId = decoded.sub;
        next();
    } catch {
        next(new UnauthorizedError('Authentication error'));
    }
};
