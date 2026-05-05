import type { MovieGenreDTO } from '@duckflixapp/shared';
import type { CastMemberDTO } from '@duckflixapp/shared/dtos/cast.dto';
import type { Genre, Movie } from '@schema/movie.schema';
import type { MovieMetadata } from '@shared/services/metadata/metadata.types';
import type { UpdateMovieInput } from './validators/movies.validator';
import type { RichVideo } from '@shared/mappers/video.mapper';

export type RichMovieRecord = Movie & {
    genres: { genre: Genre }[];
    video: RichVideo;
};

export type MoviesListResult = {
    results: RichMovieRecord[];
    totalItems: number;
};

export type MovieUpdateResult = {
    id: string;
    tmdbId: number | null;
};

export interface MoviesRepository {
    list(options: { page: number; limit: number; search?: string; orderBy?: string; genreId?: string }): Promise<MoviesListResult>;
    updateById(id: string, data: Partial<MovieMetadata>, genreIds?: string[]): Promise<MovieUpdateResult | null>;
    findById(id: string): Promise<RichMovieRecord | null>;
    countInWatchlist(data: { movieId: string; profileId: string }): Promise<number>;
    findFeaturedId(): Promise<string | null>;
}

export interface MovieGenresRepository {
    create(name: string): Promise<Genre | null>;
    list(): Promise<Genre[]>;
    findIdsByNames(names: string[]): Promise<string[]>;
}

export interface MovieCastService {
    getOrSyncMovieCast(movieId: string, tmdbMovieId: number | null): Promise<CastMemberDTO[]>;
    syncMovieCast(movieId: string, tmdbMovieId: number): Promise<CastMemberDTO[]>;
}

export interface MovieMetadataEnricher {
    enrichMovieUpdate(url: string | undefined | null, manual: UpdateMovieInput): Promise<Partial<MovieMetadata> | null>;
}

export interface MoviesLogger {
    warn(data: unknown, message: string): void;
}

export interface MovieGenresServicePort {
    createGenre(name: string): Promise<MovieGenreDTO>;
    getGenres(): Promise<MovieGenreDTO[]>;
    getMovieGenreIds(genreNames: string[]): Promise<string[]>;
}
