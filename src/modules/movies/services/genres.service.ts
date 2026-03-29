import type { MovieGenreDTO } from '@duckflix/shared';
import { movieGenres } from '@shared/schema/movie.schema';
import { db } from '@shared/configs/db';
import { toGenreDTO } from '@shared/mappers/movies.mapper';
import { inArray } from 'drizzle-orm';
import { AppError } from '@shared/errors';

export const createGenre = async (name: string): Promise<MovieGenreDTO> => {
    const results = await db
        .insert(movieGenres)
        .values({ name })
        .returning()
        .catch(async (err) => {
            throw new AppError('Database insert failed for genres', { cause: err });
        });
    if (results.length == 0 || !results[0]) throw new AppError('Genre not created', { statusCode: 500 });
    return toGenreDTO(results[0]);
};

export const getGenres = async (): Promise<MovieGenreDTO[]> => {
    const results = await db.select().from(movieGenres).orderBy(movieGenres.name);
    return results.map(toGenreDTO);
};

export const getGenreIds = async (genreNames: string[]): Promise<string[]> => {
    if (!genreNames.length) return [];

    const results = await db
        .select({ id: movieGenres.id })
        .from(movieGenres)
        .where(inArray(movieGenres.name, genreNames))
        .orderBy(movieGenres.name);
    return results.map(({ id }) => id);
};
