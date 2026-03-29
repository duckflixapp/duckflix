import { AppError } from '@shared/errors';

export class LibraryNotFoundError extends AppError {
    constructor() {
        super('Library not found', { statusCode: 404 });
    }
}
