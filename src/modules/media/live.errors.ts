import { AppError } from '@shared/errors';

export class VideoNotFoundError extends AppError {
    constructor() {
        super('Movie not found', { statusCode: 404 });
    }
}

export class NoVideoMediaFoundError extends AppError {
    constructor() {
        super('There is no media for movie', { statusCode: 404 });
    }
}

export class TooBigResolutionError extends AppError {
    constructor() {
        super('Resolution is bigger than original', { statusCode: 400 });
    }
}

export class NotStandardResolutionError extends AppError {
    constructor() {
        super('Resolution is not standard', { statusCode: 400 });
    }
}
