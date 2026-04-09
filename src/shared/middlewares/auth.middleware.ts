import { Elysia } from 'elysia';
import type { ExtendedError, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { z } from 'zod';

import { AppError } from '@shared/errors';
import { verifyToken } from '@utils/jwt';
import { roleHierarchy, type UserRole } from '@duckflixapp/shared';
import { csrfPlugin } from './csrf.middleware';

// ----- Schema -----
export const AuthUserSchema = z.object({
    id: z.string(),
    role: z.string().describe('User role'),
    isVerified: z.boolean().describe('Is email verified'),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

// ----- Error -----
export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized access') {
        super(message, { statusCode: 401 });
    }
}

export class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, { statusCode: 403 });
    }
}

// ----- Auth Plugin -----
export const authPlugin = new Elysia({ name: 'auth-plugin' })
    .use(csrfPlugin)
    .derive({ as: 'global' }, ({ cookie: { auth_token }, headers }) => ({
        resolveUser: (needsVerification = true): AuthUser => {
            const authHeader = headers.authorization;
            const token = auth_token?.value ?? (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);

            if (!token) throw new UnauthorizedError('No token provided');

            try {
                const decoded = verifyToken(token as string);
                const user: AuthUser = {
                    id: decoded.sub,
                    role: decoded.role as UserRole,
                    isVerified: decoded.isVerified,
                };

                if (needsVerification && !user.isVerified) {
                    throw new ForbiddenError('Email not verified');
                }

                return user;
            } catch (err) {
                if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Expired token');
                throw new UnauthorizedError('Invalid token');
            }
        },
    }));

// ----- Auth Macros -----
export const authGuard = new Elysia({ name: 'auth-guard' }).use(authPlugin).macro({
    auth: (options: UserRole | boolean | { role?: UserRole; verified?: boolean }) => ({
        resolve: ({ resolveUser }) => {
            const role = typeof options === 'string' ? options : typeof options === 'object' ? (options.role ?? true) : true;
            const needsVerification = typeof options === 'object' && options.verified !== undefined ? options.verified : true;

            if (!role) return;
            const user = resolveUser(needsVerification);

            if (typeof role === 'string') {
                const currentUserRank = roleHierarchy[user.role as keyof typeof roleHierarchy];
                const requiredRank = roleHierarchy[role as keyof typeof roleHierarchy];

                if (currentUserRank > requiredRank) {
                    throw new ForbiddenError('Insufficient permissions');
                }
            }

            return { user };
        },
    }),
});

// ----- Socket Authentication -----
export const authenticateSocket = async (socket: Socket, next: (err?: ExtendedError) => unknown) => {
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
