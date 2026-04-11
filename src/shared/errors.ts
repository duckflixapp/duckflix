import { logger } from '@shared/configs/logger';
import Elysia, { NotFoundError, ValidationError } from 'elysia';

export class AppError extends Error {
    public readonly originalError?: unknown;
    public readonly statusCode?: number;

    constructor(
        public override message: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options?: { cause?: any; statusCode?: number }
    ) {
        super(message);
        this.name = 'AppError';
        this.statusCode = options?.statusCode;
        this.originalError = options?.cause;
        if (options?.cause?.stack) {
            this.stack += `\nCAUSED BY: ${options.cause.stack}`;
        }
    }
}

export const errorPlugin = new Elysia().onError({ as: 'global' }, ({ error, request, set, server, status }) => {
    if (error instanceof ValidationError) {
        set.status = 400;
        return { error: 'Validation error', details: error.all.map((i) => ({ field: i.path, message: i.message })) };
    }
    if (error instanceof NotFoundError) {
        return status(404);
    }
    if (error instanceof AppError) {
        if (!error.statusCode || error.statusCode >= 500) {
            logger.error({ path: new URL(request.url).pathname, method: request.method, err: error }, `AppError 500`);
        }
        set.status = error.statusCode ?? 500;
        return { status: error.statusCode && error.statusCode < 500 ? 'fail' : 'error', message: error.message };
    }
    logger.error(
        {
            path: new URL(request.url).pathname,
            method: request.method,
            ip: server?.requestIP(request)?.address,
            userAgent: request.headers.get('user-agent'),
            err: error,
        },
        `Unexpected Server Error`
    );
    set.status = 500;
    return { error: 'Internal server error' };
});
