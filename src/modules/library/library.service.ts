import type { LibraryDTO, LibraryItemDTO, LibraryMinDTO, PaginatedResponse } from '@duckflixapp/shared';

import { AppError } from '@shared/errors';
import { toLibraryDTO, toLibraryItemDTO, toLibraryMinDTO } from '@shared/mappers/library.mapper';
import { LibraryNotFoundError } from './library.errors';
import {
    DuplicateLibraryItemError,
    DuplicateLibraryNameError,
    LibraryCreateFailedError,
    LibraryLimitReachedError,
    type ContentType,
    type LibraryRepository,
} from './library.ports';

type LibraryServiceDependencies = {
    libraryRepository: LibraryRepository;
};

const reservedLibraryNames = ['watchlist'];
const MAX_LIBRARIES = 10;

export const createLibraryService = ({ libraryRepository }: LibraryServiceDependencies) => {
    const getUserLibraries = async (profileId: string, options?: { custom?: boolean }): Promise<LibraryMinDTO[]> => {
        const results = await libraryRepository.listByProfile(profileId, options);
        return results.map(toLibraryMinDTO);
    };

    const createUserLibrary = async (profileId: string, context: { accountId: string; name: string }): Promise<LibraryMinDTO> => {
        if (reservedLibraryNames.includes(context.name.toLowerCase())) throw new AppError('Name is unavailable', { statusCode: 409 });

        try {
            const result = await libraryRepository.createCustom({
                profileId,
                accountId: context.accountId,
                name: context.name,
                maxLibraries: MAX_LIBRARIES,
            });

            return toLibraryMinDTO(result);
        } catch (error) {
            if (error instanceof LibraryLimitReachedError) {
                throw new AppError(`You have reached the library limit (max ${error.limit}).`, { statusCode: 403 });
            }
            if (error instanceof DuplicateLibraryNameError) {
                throw new AppError(`You already have library with that name.`, { statusCode: 409 });
            }
            if (error instanceof LibraryCreateFailedError) {
                throw new AppError('Library not created', { statusCode: 500 });
            }
            throw error;
        }
    };

    const deleteUserLibrary = async (profileId: string, libraryId: string, context: { accountId: string }): Promise<void> => {
        const result = await libraryRepository.deleteCustom({ profileId, libraryId, accountId: context.accountId });

        if (result === 'not_found') throw new LibraryNotFoundError();
        if (result === 'not_custom') throw new AppError(`You can only delete custom playlists`, { statusCode: 403 });
    };

    const addContentToUserLibrary = async (profileId: string, libraryId: string, contentId: string, type: ContentType): Promise<void> => {
        try {
            const result = await libraryRepository.addContent({ profileId, libraryId, contentId, type });

            if (result === 'library_not_found') throw new LibraryNotFoundError();
            if (result === 'content_not_found')
                throw new AppError(type === 'movie' ? 'Movie not found' : 'Series not found', { statusCode: 404 });
        } catch (error) {
            if (error instanceof DuplicateLibraryItemError) throw new AppError(`Content is already in library.`, { statusCode: 409 });
            throw error;
        }
    };

    const removeContentFromUserLibrary = async (
        profileId: string,
        libraryId: string,
        contentId: string,
        type: ContentType
    ): Promise<void> => {
        const result = await libraryRepository.removeContent({ profileId, libraryId, contentId, type });

        if (result === 'library_not_found') throw new LibraryNotFoundError();
        if (result === 'item_not_found') throw new AppError('Content not found in library', { statusCode: 404 });
    };

    const getUserLibrary = async (profileId: string, libraryId: string): Promise<LibraryDTO> => {
        const result = await libraryRepository.findById({ profileId, libraryId });

        if (!result) throw new LibraryNotFoundError();

        return toLibraryDTO(result);
    };

    const getUserLibraryItems = async (
        profileId: string,
        libraryId: string,
        options: {
            page: number;
            limit: number;
            search?: string;
        }
    ): Promise<PaginatedResponse<LibraryItemDTO>> => {
        const result = await libraryRepository.listItems({
            profileId,
            libraryId,
            page: options.page,
            limit: options.limit,
            search: options.search,
        });

        if (!result) throw new LibraryNotFoundError();

        return {
            data: result.results.map(toLibraryItemDTO),
            meta: {
                totalItems: result.totalItems,
                itemCount: result.results.length,
                itemsPerPage: options.limit,
                totalPages: Math.ceil(result.totalItems / options.limit),
                currentPage: options.page,
            },
        };
    };

    return {
        addContentToUserLibrary,
        createUserLibrary,
        deleteUserLibrary,
        getUserLibraries,
        getUserLibrary,
        getUserLibraryItems,
        removeContentFromUserLibrary,
    };
};

export type LibraryService = ReturnType<typeof createLibraryService>;
