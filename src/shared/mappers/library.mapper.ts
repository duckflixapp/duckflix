import type { AccountLibraryDTO as LibraryDTO, AccountLibraryMinDTO as LibraryMinDTO, LibraryItemDTO } from '@duckflixapp/shared';
import type { Movie, Library, Series } from '@schema/index';
import { toAccountRefDTO } from './user.mapper';
import { toContentDTO } from './content.mapper';
import type { AccountRefSource } from './user.mapper';

export const toLibraryDTO = (library: Library & { user: AccountRefSource }): LibraryDTO => ({
    ...toLibraryMinDTO(library),
    user: toAccountRefDTO(library.user),
});

export const toLibraryMinDTO = (library: Library): LibraryMinDTO => ({
    id: library.id,
    name: library.name,
    type: library.type,
    size: library.size,
    accountId: library.accountId,
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
