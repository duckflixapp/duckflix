import express from 'express';
import cookieParser from 'cookie-parser';
import { globalErrorHandler } from './shared/errors';
import router from './routes/v1';
import { env } from './env';
import { httpLogger } from './shared/utils/logger';
import { helmetConfiguration } from './shared/configs/helmet';
import { corsConfiguration } from './shared/configs/cors';

const app = express();

app.set('trust proxy', env.PROXIES);
app.use(httpLogger);

app.use(helmetConfiguration);
app.use(corsConfiguration);

app.use(express.json());
app.use(cookieParser());

app.use('/v1/', router);

app.use(globalErrorHandler);

export { app };
