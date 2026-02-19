import { toUserMinDTO } from './user.mapper';
import type { Genre, Movie, MovieVersion, Subtitle } from '../schema';
import type { MovieDetailedDTO, MovieDTO, MovieVersionDTO, SubtitleDTO } from '@duckflix/shared';
import { env } from '../../env';

const BASE_URL = env.BASE_URL;

export const toMovieVersionDTO = (v: MovieVersion): MovieVersionDTO => ({
    id: v.id,
    height: v.height,
    width: v.width,
    status: v.status,
    fileSize: v.fileSize,
    mimeType: v.mimeType,
    streamUrl: `${BASE_URL}/media/stream/${v.id}`,
    isOriginal: v.isOriginal,
});

export const toMovieDTO = (movie: Movie & { genres: { genre: Genre }[] }): MovieDTO => ({
    id: movie.id,
    title: movie.title,
    bannerUrl: movie.bannerUrl,
    posterUrl: movie.posterUrl,
    rating: movie.rating,
    releaseYear: movie.releaseYear,
    duration: movie.duration,
    genres: movie.genres.map((g) => toGenreDTO(g.genre)),
    status: movie.status,
    createdAt: movie.createdAt,
});

export const toGenreDTO = (genre: Genre) => ({
    id: genre.id,
    name: genre.name,
});

export const toSubtitleDTO = (s: Subtitle): SubtitleDTO => ({
    id: s.id,
    movieId: s.movieId,
    language: s.language,
    subtitleUrl: `${BASE_URL}/media/subtitle/${s.id}`,
    createdAt: s.createdAt,
});

export const toMovieDetailedDTO = (
    movie: Movie & {
        genres: { genre: Genre }[];
        versions: MovieVersion[];
        user: { id: string; name: string; role: 'watcher' | 'contributor' | 'admin' };
        subtitles: Subtitle[];
    }
): MovieDetailedDTO => ({
    ...toMovieDTO(movie),
    description: movie.description,
    versions: movie.versions.map(toMovieVersionDTO),
    subtitles: movie.subtitles.map(toSubtitleDTO),
    user: toUserMinDTO(movie.user),
});
