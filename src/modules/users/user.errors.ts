import { AppError } from '../../shared/errors';

export class UserNotFoundError extends AppError {
    constructor() {
        super('User not found or deleted', { statusCode: 404 });
    }
}
