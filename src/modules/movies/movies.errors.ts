import { AppError } from '@shared/errors';

export class MovieNotCreatedError extends AppError {
    constructor() {
        super('Error while creating movie', { statusCode: 500 });
    }
}

export class InvalidVideoFileError extends AppError {
    constructor() {
        super('The uploaded file is not a valid video or corrupted.', { statusCode: 400 });
    }
}

export class MovieNotFoundError extends AppError {
    constructor() {
        super('Movie not found', { statusCode: 404 });
    }
}
