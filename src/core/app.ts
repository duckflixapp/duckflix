import { Elysia } from 'elysia';
import { env } from '@core/env';
import { corsPlugin } from '@shared/configs/cors';
import { helmetPlugin } from '@shared/configs/helmet';
import { loggerPlugin } from '@shared/configs/httpLogger';
import { documentationTags } from '@shared/configs/openapi';
import { errorPlugin } from '@shared/errors';
import { openapi } from '@elysiajs/openapi';
import { v1 } from '../routes/v1';
import { assetsRouter } from '../routes/assets';

const app = new Elysia().use(loggerPlugin).use(errorPlugin).use(corsPlugin).use(helmetPlugin).use(assetsRouter).use(v1);

if (env.NODE_ENV !== 'production') {
    app.use(
        openapi({
            specPath: '/openapi.json',
            path: '/swagger',
            scalar: {
                showDeveloperTools: 'never',
                layout: 'modern',
                defaultOpenAllTags: true,
            },
            documentation: {
                info: {
                    title: 'Duckflix API Documentation',
                    description:
                        'High-performance media streaming engine powered by Bun & Elysia. Handles video processing, HLS streaming, and metadata management.',
                    version: env.VERSION,
                    contact: {
                        name: 'Nikola Nedeljković',
                        url: 'https://github.com/nikola04',
                        email: 'nikolanedeljkovicc@icloud.com',
                    },
                },
                tags: documentationTags,
                components: {
                    securitySchemes: {
                        JwtAuth: {
                            type: 'http',
                            scheme: 'bearer',
                            bearerFormat: 'JWT',
                            description: 'Standard Authorization header: Bearer <token>',
                        },
                        CookieAuth: {
                            type: 'apiKey',
                            in: 'cookie',
                            name: 'auth_token',
                            description: 'Authentication cookie: auth_token=<token>',
                        },
                    },
                },
            },
        })
    );
}

export { app };
