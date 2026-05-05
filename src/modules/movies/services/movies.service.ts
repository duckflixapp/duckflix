import type { MovieDetailedDTO, MovieDTO, PaginatedResponse } from '@duckflixapp/shared';

import { toMovieDetailedDTO, toMovieDTO } from '@shared/mappers/movies.mapper';
import type { MovieMetadata } from '@shared/services/metadata/metadata.types';
import { MovieNotFoundError } from '../movies.errors';
import type { MovieCastService, MovieGenresServicePort, MoviesLogger, MoviesRepository } from '../movies.ports';

type MoviesServiceDependencies = {
    moviesRepository: MoviesRepository;
    movieGenresService: MovieGenresServicePort;
    movieCastService: MovieCastService;
    logger: MoviesLogger;
};

export const createMoviesService = ({ moviesRepository, movieGenresService, movieCastService, logger }: MoviesServiceDependencies) => {
    const getMovies = async (options: {
        page: number;
        limit: number;
        search?: string;
        orderBy?: string;
        genreId?: string;
    }): Promise<PaginatedResponse<MovieDTO>> => {
        const { results, totalItems } = await moviesRepository.list(options);

        return {
            data: results.map(toMovieDTO),
            meta: {
                totalItems,
                itemCount: results.length,
                itemsPerPage: options.limit,
                totalPages: Math.ceil(totalItems / options.limit),
                currentPage: options.page,
            },
        };
    };

    const updateMovieById = async (id: string, data: Partial<MovieMetadata>): Promise<MovieDetailedDTO> => {
        const shouldSyncCast = typeof data.tmdbId === 'number';
        const genreIds = data.genres ? await movieGenresService.getMovieGenreIds(data.genres) : undefined;
        const modified = await moviesRepository.updateById(id, data, genreIds);

        if (!modified) throw new MovieNotFoundError();

        if (modified.tmdbId && shouldSyncCast) {
            await movieCastService.syncMovieCast(id, modified.tmdbId).catch((err) => {
                logger.warn({ err, movieId: id, tmdbId: modified.tmdbId }, 'Failed to sync movie cast after update');
            });
        }

        return getMovieById(id);
    };

    const getMovieById = async (id: string, options: { profileId: string | null } = { profileId: null }): Promise<MovieDetailedDTO> => {
        const result = await moviesRepository.findById(id);

        if (!result) throw new MovieNotFoundError();

        const inLibraryPromise = options.profileId
            ? moviesRepository.countInWatchlist({ movieId: id, profileId: options.profileId })
            : Promise.resolve(0);

        const castPromise = movieCastService.getOrSyncMovieCast(result.id, result.tmdbId).catch((err) => {
            logger.warn({ err, movieId: id, tmdbId: result.tmdbId }, 'Failed to load movie cast');
            return [];
        });

        const [libraryCount, cast] = await Promise.all([inLibraryPromise, castPromise]);
        const inLibrary = libraryCount > 0;

        return {
            ...toMovieDetailedDTO(result, inLibrary),
            cast,
        };
    };

    const getFeatured = async (options: { profileId: string | null } = { profileId: null }) => {
        const featuredId = await moviesRepository.findFeaturedId();
        if (!featuredId) return null;

        return getMovieById(featuredId, options);
    };

    return {
        getFeatured,
        getMovieById,
        getMovies,
        updateMovieById,
    };
};

export type MoviesService = ReturnType<typeof createMoviesService>;
