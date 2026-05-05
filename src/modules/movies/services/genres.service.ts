import type { MovieGenreDTO } from '@duckflixapp/shared';

import { AppError } from '@shared/errors';
import { toGenreDTO } from '@shared/mappers/movies.mapper';
import type { MovieGenresRepository } from '../movies.ports';

type GenresServiceDependencies = {
    movieGenresRepository: MovieGenresRepository;
};

export const createGenresService = ({ movieGenresRepository }: GenresServiceDependencies) => {
    const createGenre = async (name: string): Promise<MovieGenreDTO> => {
        const result = await movieGenresRepository.create(name).catch(async (err) => {
            throw new AppError('Database insert failed for genres', { cause: err });
        });

        if (!result) throw new AppError('Genre not created', { statusCode: 500 });
        return toGenreDTO(result);
    };

    const getGenres = async (): Promise<MovieGenreDTO[]> => {
        const results = await movieGenresRepository.list();
        return results.map(toGenreDTO);
    };

    const getMovieGenreIds = (genreNames: string[]): Promise<string[]> => movieGenresRepository.findIdsByNames(genreNames);

    return {
        createGenre,
        getGenres,
        getMovieGenreIds,
    };
};

export type GenresService = ReturnType<typeof createGenresService>;
