import helmet from 'helmet';
import { env } from '../../env';

export const helmetConfiguration = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            imgSrc: ["'self'", 'data:', 'https://image.tmdb.org'],
            mediaSrc: ["'self'", 'blob:', 'data:', env.BASE_URL, env.ORIGIN, 'https://www.gstatic.com'],
            connectSrc: ["'self'", env.BASE_URL, env.ORIGIN, 'https://www.gstatic.com'],
            upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hidePoweredBy: true,
    crossOriginEmbedderPolicy: false,
});
