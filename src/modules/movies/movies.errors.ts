import { AppError } from '../../shared/errors';

export class MovieNotCreatedError extends AppError {
    constructor() {
        super('Error while creating movie', { statusCode: 500 });
    }
}

export class InvalidVideoFileError extends AppError {
    constructor() {
        super('The uploaded file is not a valid video or is corrupted.', { statusCode: 400 });
    }
}

export class MovieVersionNotFoundError extends AppError {
    constructor() {
        super('The requested movie version was not found.', { statusCode: 404 });
    }
}

export class VideoProcessingError extends AppError {
    constructor(message: string, e?: unknown) {
        super(message, { statusCode: 500, cause: e });
    }
}

export class MovieNotFoundError extends AppError {
    constructor() {
        super('Movie not found', { statusCode: 404 });
    }
}

export class TorrentDownloadError extends AppError {
    constructor(cause: { message?: string; code?: string }) {
        let friendlyMessage = 'Torrent could not be downloaded';
        if (cause?.message?.includes('no peers')) friendlyMessage = 'No active seeders found for this torrent.';
        if (cause?.code === 'ENOSPC') friendlyMessage = 'Not enough disk space for download.';

        super(friendlyMessage, { cause, statusCode: 400 });
    }
}
