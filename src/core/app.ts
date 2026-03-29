import express from 'express';
import cookieParser from 'cookie-parser';
import { globalErrorHandler } from '@shared/errors';
import router from '../routes/v1';
import { env } from './env';
import { httpLogger } from '@shared/configs/logger';
import { helmetConfiguration } from '@shared/configs/helmet';
import { corsConfiguration } from '@shared/configs/cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerDoc } from '@shared/configs/swagger';

const app = express();

app.set('trust proxy', env.PROXIES);
app.use(httpLogger);

app.use(helmetConfiguration);
app.use(corsConfiguration);

if (env.NODE_ENV !== 'production') {
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
}

app.use(express.json());
app.use(cookieParser());

app.use('/v1/', router);

app.use(globalErrorHandler);

export { app };
