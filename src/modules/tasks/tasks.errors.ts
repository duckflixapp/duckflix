import { AppError } from '@shared/errors';

export class TaskNotFoundError extends AppError {
    constructor() {
        super('Error task not found', { statusCode: 500 });
    }
}
