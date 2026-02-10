import { toUserMinDTO } from './user.mapper';
import type { Movie, MovieVersion } from '../schema';
import type { MovieDetailedDTO, MovieDTO, MovieVersionDTO } from '@duckflix/shared';

const BASE_URL = process.env.BASE_URL ?? '';

export const toMovieVersionDTO = (v: MovieVersion): MovieVersionDTO => ({
    id: v.id,
    height: v.height,
    width: v.width,
    status: v.status,
    fileSize: v.fileSize,
    mimeType: v.mimeType,
    streamUrl: `${BASE_URL}/media/stream/${v.id}`,
});

export const toMovieDTO = (movie: Movie): MovieDTO => ({
    id: movie.id,
    title: movie.title,
    status: movie.status,
    createdAt: movie.createdAt.toISOString(),
});

export const toMovieDetailedDTO = (movie: Movie & { versions: MovieVersion[]; user: { id: string; name: string } }): MovieDetailedDTO => ({
    ...toMovieDTO(movie),
    user: toUserMinDTO(movie.user),
    versions: movie.versions.map(toMovieVersionDTO),
});
