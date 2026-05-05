import { logger } from '@shared/configs/logger';
import { getOrSyncMovieCast, syncMovieCast } from '@shared/services/cast.service';
import { metadataUpdateEnrichers } from '@shared/services/metadata/metadata.service';
import { drizzleMovieGenresRepository } from './movie-genres.drizzle.repository';
import { createGenresService } from './services/genres.service';
import { createMoviesService } from './services/movies.service';
import { drizzleMoviesRepository } from './movies.drizzle.repository';

export const movieGenresService = createGenresService({
    movieGenresRepository: drizzleMovieGenresRepository,
});

export const moviesService = createMoviesService({
    moviesRepository: drizzleMoviesRepository,
    movieGenresService,
    movieCastService: {
        getOrSyncMovieCast,
        syncMovieCast,
    },
    logger,
});

export const movieMetadataEnricher = {
    enrichMovieUpdate: metadataUpdateEnrichers.movie,
};
