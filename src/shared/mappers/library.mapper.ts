import type { LibraryDTO, LibraryItemDTO, LibraryMinDTO } from '@duckflixapp/shared';
import type { Movie, Library, Profile, Series } from '@schema/index';
import { toProfileMinDTO } from './user.mapper';
import { toContentDTO } from './content.mapper';

export const toLibraryDTO = (library: Library & { profile: Profile }): LibraryDTO => ({
    ...toLibraryMinDTO(library),
    profile: toProfileMinDTO(library.profile),
});

export const toLibraryMinDTO = (library: Library): LibraryMinDTO => ({
    id: library.id,
    name: library.name,
    type: library.type,
    size: library.size,
    profileId: library.profileId,
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
