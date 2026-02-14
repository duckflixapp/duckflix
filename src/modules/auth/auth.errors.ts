import { AppError } from '../../shared/errors';

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

export class UserNotFoundError extends AppError {
    constructor() {
        super('User not found or deleted', { statusCode: 404 });
    }
}

export class InvalidCredentialsError extends AppError {
    constructor() {
        super('Invalid email or password', { statusCode: 401 });
    }
}
