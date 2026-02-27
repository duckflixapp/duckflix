import type { LibraryDTO, LibraryItemDTO, LibraryItemMinDTO, LibraryMinDTO } from '@duckflix/shared';
import type { Library, LibraryItem, Movie, User } from '../schema';
import { toUserMinDTO } from './user.mapper';
import { toMovieMinDTO } from './movies.mapper';

export const toLibraryDTO = (library: Library & { user: Pick<User, 'id' | 'name' | 'role'> }): LibraryDTO => ({
    ...toLibraryMinDTO(library),
    user: toUserMinDTO(library.user),
});

export const toLibraryMinDTO = (library: Library): LibraryMinDTO => ({
    id: library.id,
    name: library.name,
    type: library.type,
    size: library.size,
    userId: library.userId,
    createdAt: library.createdAt,
});

export const toLibraryItemMinDTO = (item: LibraryItem): LibraryItemMinDTO => ({
    libraryId: item.libraryId,
    movieId: item.movieId,
});

export const toLibraryItemDTO = (item: LibraryItem & { movie: Movie }): LibraryItemDTO => ({
    ...toLibraryItemMinDTO(item),
    movie: toMovieMinDTO(item.movie),
});
