import { AppError } from '@shared/errors';

export const parseIdFromUrl = (url: string): string => {
    const match = url.match(/tt\d+/);
    if (match) return match[0];
    throw new AppError('Invalid IMDB URL', { statusCode: 400 });
};
