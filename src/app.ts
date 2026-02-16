import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { globalErrorHandler } from './shared/errors';
import router from './routes/v1';
import helmet from 'helmet';

const app = express();

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                imgSrc: ["'self'", 'data:', 'https://image.tmdb.org'],
                mediaSrc: ["'self'", process.env.BASE_URL!, process.env.ORIGIN!],
                connectSrc: ["'self'", process.env.BASE_URL!],
                upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
            },
        },
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        hidePoweredBy: true,
    })
);
app.use(cors({ origin: process.env.ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/v1/', router);

app.use(globalErrorHandler);

export { app };
