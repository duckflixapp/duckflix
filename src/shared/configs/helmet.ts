import { helmet } from 'elysia-helmet';
import { env } from '@core/env';

export const helmetPlugin = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
            imgSrc: ["'self'", 'data:', 'https://image.tmdb.org', 'https://cdn.jsdelivr.net'],
            connectSrc: ["'self'", env.BASE_URL, env.ORIGIN, 'https://www.gstatic.com', 'https://cdn.jsdelivr.net'],
            mediaSrc: ["'self'", 'blob:', 'data:', env.BASE_URL, env.ORIGIN, 'https://www.gstatic.com'],
            upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hidePoweredBy: true,
    crossOriginEmbedderPolicy: false,
});
