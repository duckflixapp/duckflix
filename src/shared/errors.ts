import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
    constructor(
        public override message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized access') {
        super(message, 401);
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
        return res.status(err.statusCode).json({
            error: err.message,
        });
    }

    console.error('ERROR:', err);
    return res.status(500).json({ error: 'Internal server error' });
};
