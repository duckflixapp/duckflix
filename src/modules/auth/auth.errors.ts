import { AppError } from '@shared/errors';

export class EmailAlreadyExistsError extends AppError {
    constructor() {
        super('Email already exists', { statusCode: 409 });
    }
}

export class UserNotCreatedError extends AppError {
    constructor() {
        super('Error while creating account', { statusCode: 500 });
    }
}

export class InvalidCredentialsError extends AppError {
    constructor() {
        super('Invalid email or password', { statusCode: 401 });
    }
}

export class TooManyAuthAttemptsError extends AppError {
    constructor(retryAfterMs: number) {
        const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
        super('Too many authentication attempts. Try again later.', {
            statusCode: 429,
            headers: { 'Retry-After': String(retryAfterSeconds) },
            details: { retryAfterSeconds },
        });
    }
}

export class AuthTemporarilyLockedError extends AppError {
    constructor(retryAfterMs: number) {
        const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
        super('Too many authentication attempts. Try again later.', {
            statusCode: 429,
            headers: { 'Retry-After': String(retryAfterSeconds) },
            details: { retryAfterSeconds },
        });
    }
}
