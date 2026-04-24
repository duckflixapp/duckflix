import { toVideoDTO, type RichVideo } from './video.mapper';
import type { Genre, Movie } from '@schema/movie.schema';
import type { MovieDetailedDTO, MovieDTO, MovieMinDTO } from '@duckflixapp/shared';

const TMDB_MOVIE_BASE_URL = 'https://www.themoviedb.org/movie/';

type RichMovieWithVideo = Movie & { video: RichVideo } & { genres: { genre: Genre }[] };

export const toMovieTMDbUrl = (tmdbId: number | null) => (tmdbId ? TMDB_MOVIE_BASE_URL + tmdbId : null);

export const toMovieMinDTO = (movie: Movie): MovieMinDTO => ({
    id: movie.id,
    videoId: movie.videoId,
    tmdbId: movie.tmdbId,
    tmdbUrl: toMovieTMDbUrl(movie.tmdbId),
    title: movie.title,
    overview: movie.overview,
    bannerUrl: movie.bannerUrl,
    posterUrl: movie.posterUrl,
    rating: movie.rating,
    releaseYear: movie.releaseYear,
    runtime: movie.runtime,
});

export const toMovieDTO = (movie: RichMovieWithVideo): MovieDTO => ({
    ...toMovieMinDTO(movie),
    video: toVideoDTO(movie.video),
    genres: movie.genres.map((g) => toGenreDTO(g.genre)),
});

export const toGenreDTO = (genre: Genre) => ({
    id: genre.id,
    name: genre.name,
});

export const toMovieDetailedDTO = (movie: RichMovieWithVideo, inUserLibrary?: boolean | null): MovieDetailedDTO => ({
    ...toMovieDTO(movie),
    inUserLibrary: inUserLibrary ?? null,
    cast: [],
});
