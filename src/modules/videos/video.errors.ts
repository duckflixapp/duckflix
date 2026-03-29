import { AppError } from '@shared/errors';

export class VideoNotCreatedError extends AppError {
    constructor() {
        super('Error while creating video', { statusCode: 500 });
    }
}

export class InvalidVideoFileError extends AppError {
    constructor() {
        super('The uploaded file is not a valid video or corrupted.', { statusCode: 400 });
    }
}

export class VideoVersionNotFoundError extends AppError {
    constructor() {
        super('The requested video version was not found.', { statusCode: 404 });
    }
}

export class OriginalVideoVersionNotFoundError extends AppError {
    constructor() {
        super('The requested video has no original version.', { statusCode: 404 });
    }
}

export class VideoProcessingError extends AppError {
    constructor(message: string, e?: unknown) {
        super(message, { statusCode: 500, cause: e });
    }
}

export class VideoNotFoundError extends AppError {
    constructor() {
        super('Video not found', { statusCode: 404 });
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

export class SubtitleDownloadError extends AppError {
    constructor(message: string, cause?: unknown) {
        super(`Subtitle Download: ${message}`, { statusCode: 502, cause });
    }
}

export class SubtitleConversionError extends AppError {
    constructor(message: string, cause?: unknown) {
        super(`Subtitle Conversion: ${message}`, { statusCode: 500, cause });
    }
}
