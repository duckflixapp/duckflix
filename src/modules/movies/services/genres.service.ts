import type { GenreDTO } from '@duckflix/shared';
import { genres } from '../../../shared/schema';
import { db } from '../../../shared/db';
import { toGenreDTO } from '../../../shared/mappers/movies.mapper';
import { inArray } from 'drizzle-orm';
import { AppError } from '../../../shared/errors';

export const createGenre = async (name: string): Promise<GenreDTO> => {
    const results = await db
        .insert(genres)
        .values({ name })
        .returning()
        .catch(async (err) => {
            throw new AppError('Database insert failed for genres', { cause: err });
        });
    if (results.length == 0 || !results[0]) throw new AppError('Genre not created', { statusCode: 500 });
    return toGenreDTO(results[0]);
};

export const getGenres = async (): Promise<GenreDTO[]> => {
    const results = await db.select().from(genres).orderBy(genres.name);
    return results.map(toGenreDTO);
};

export const getGenreIds = async (genreNames: string[]): Promise<string[]> => {
    const results = await db.select({ id: genres.id }).from(genres).where(inArray(genres.name, genreNames)).orderBy(genres.name);
    return results.map(({ id }) => id);
};
