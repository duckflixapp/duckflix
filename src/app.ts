import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { globalErrorHandler } from './shared/errors';
import router from './routes/v1';
import helmet from 'helmet';
import { env } from './env';

const app = express();

app.set('trust proxy', env.PROXIES);
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                imgSrc: ["'self'", 'data:', 'https://image.tmdb.org'],
                mediaSrc: ["'self'", env.BASE_URL, env.ORIGIN],
                connectSrc: ["'self'", env.BASE_URL],
                upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
            },
        },
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        hidePoweredBy: true,
    })
);
app.use(cors({ origin: env.ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/v1/', router);

app.use(globalErrorHandler);

export { app };
