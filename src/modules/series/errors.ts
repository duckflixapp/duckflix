import { AppError } from '@shared/errors';

export class SeriesNotFound extends AppError {
    constructor() {
        super('Series not found', { statusCode: 404 });
    }
}

export class SeriesSeasonNotFound extends AppError {
    constructor() {
        super('Season not found', { statusCode: 404 });
    }
}

export class SeasonEpisodeNotFound extends AppError {
    constructor() {
        super('Episode not found', { statusCode: 404 });
    }
}
