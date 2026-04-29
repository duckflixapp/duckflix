import { rateLimit } from 'elysia-rate-limit';
import { resolveClientIp } from '@shared/plugins/trust-proxy';

interface RateLimitOptions {
    max?: number;
    duration?: number;
    scoping?: 'global' | 'scoped';
}

export const createRateLimit = ({ max = 50, duration = 3000, scoping = 'scoped' }: RateLimitOptions = {}) => {
    return rateLimit({
        max,
        duration,
        scoping,
        generator: (request, server, { user }) => {
            if (user?.id) return user.id;

            return resolveClientIp(request, server) ?? 'localhost';
        },
        errorResponse: new Response(
            JSON.stringify({
                status: 'fail',
                message: 'Too many requests. Try again later',
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
        ),
    });
};
