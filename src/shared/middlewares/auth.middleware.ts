import { Elysia } from 'elysia';
import jwt from 'jsonwebtoken';
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
export const socketAuthPlugin = new Elysia({ name: 'socketAuth' }).derive({ as: 'global' }, ({ cookie: { auth_token }, set }) => {
    const token = auth_token?.value;
    if (!token) {
        set.status = 401;
        throw new Error('Unauthorized: No token');
    }

    const decoded = verifyToken(token as string);
    if (!decoded || !decoded.sub) {
        set.status = 401;
        throw new Error('Unauthorized: Invalid token');
    }

    const user: AuthUser = {
        id: decoded.sub,
        role: decoded.role as UserRole,
        isVerified: decoded.isVerified,
    };

    return { user };
});
