import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

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

export const globalErrorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
        return res.status(400).json({
            error: 'Validation error',
            details: err.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            })),
        });
    }

    if (err instanceof AppError) {
        return res.status(err.statusCode ?? 500).json({
            status: err.statusCode && err.statusCode < 500 ? 'fail' : 'error',
            message: err.message,
        });
    }
    console.error('ERROR:', err);
    return res.status(500).json({ error: 'Internal server error' });
};
