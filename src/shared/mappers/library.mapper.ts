import type { LibraryDTO, LibraryItemDTO, LibraryMinDTO } from '@duckflix/shared';
import type { Movie, User, Library, Series } from '@schema/index';
import { toUserMinDTO } from './user.mapper';
import { toContentDTO } from './content.mapper';

export const toLibraryDTO = (library: Library & { user: Pick<User, 'id' | 'name' | 'role' | 'system'> }): LibraryDTO => ({
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

export const toLibraryItemDTO = (item: {
    id: string;
    libraryId: string;
    addedAt: string;
    movie: Movie | null;
    series: Series | null;
}): LibraryItemDTO => ({
    id: item.id,
    libraryId: item.libraryId,
    addedAt: item.addedAt,
    content: item.movie ? toContentDTO('movie', item.movie) : toContentDTO('series', item.series!),
});
