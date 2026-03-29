import { toVideoDTO, type RichVideo } from './video.mapper';
import type { Genre, Movie } from '@schema/movie.schema';
import type { MovieDetailedDTO, MovieDTO, MovieMinDTO } from '@duckflix/shared';

type RichMovieWithVideo = Movie & { video: RichVideo } & { genres: { genre: Genre }[] };

export const toMovieMinDTO = (movie: Movie): MovieMinDTO => ({
    id: movie.id,
    videoId: movie.videoId,
    title: movie.title,
    overview: movie.overview,
    bannerUrl: movie.bannerUrl,
    posterUrl: movie.posterUrl,
    rating: movie.rating,
    releaseYear: movie.releaseYear,
});

export const toMovieDTO = (movie: RichMovieWithVideo): MovieDTO => ({
    ...toMovieMinDTO(movie),
    video: toVideoDTO(movie.video),
    duration: movie.video.duration,
    genres: movie.genres.map((g) => toGenreDTO(g.genre)),
});

export const toGenreDTO = (genre: Genre) => ({
    id: genre.id,
    name: genre.name,
});

export const toMovieDetailedDTO = (movie: RichMovieWithVideo, inUserLibrary?: boolean | null): MovieDetailedDTO => ({
    ...toMovieDTO(movie),
    inUserLibrary: inUserLibrary ?? null,
});
