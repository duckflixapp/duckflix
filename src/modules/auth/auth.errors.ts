import { AppError } from '../../shared/errors';

export class EmailAlreadyExistsError extends AppError {
    constructor() {
        super('Email already exists', 409);
    }
}

export class UserNotCreatedError extends AppError {
    constructor() {
        super('Error while creating account', 500);
    }
}

export class InvalidCredentialsError extends AppError {
    constructor() {
        super('Invalid email or password', 401);
    }
}
