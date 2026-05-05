import type { Movie, Profile, Series } from '@schema/index';

export type LibraryRecord = {
    id: string;
    profileId: string;
    name: string;
    type: 'custom' | 'watchlist';
    size: number;
    createdAt: string;
};

export type LibraryWithProfileRecord = LibraryRecord & {
    profile: Profile;
};

export type LibraryItemRecord = {
    id: string;
    libraryId: string;
    addedAt: string;
    movie: Movie | null;
    series: Series | null;
};

export type ContentType = 'movie' | 'series';

export type ListLibraryItemsResult = {
    results: LibraryItemRecord[];
    totalItems: number;
};

export class DuplicateLibraryNameError extends Error {
    constructor() {
        super('Duplicate library name');
    }
}

export class DuplicateLibraryItemError extends Error {
    constructor() {
        super('Duplicate library item');
    }
}

export class LibraryCreateFailedError extends Error {
    constructor() {
        super('Library not created');
    }
}

export class LibraryLimitReachedError extends Error {
    constructor(public readonly limit: number) {
        super('Library limit reached');
    }
}

export interface LibraryRepository {
    listByProfile(profileId: string, options?: { custom?: boolean }): Promise<LibraryRecord[]>;
    createCustom(data: { profileId: string; accountId: string; name: string; maxLibraries: number }): Promise<LibraryRecord>;
    deleteCustom(data: { profileId: string; libraryId: string; accountId: string }): Promise<'deleted' | 'not_found' | 'not_custom'>;
    addContent(data: {
        profileId: string;
        libraryId: string;
        contentId: string;
        type: ContentType;
    }): Promise<'added' | 'library_not_found' | 'content_not_found'>;
    removeContent(data: {
        profileId: string;
        libraryId: string;
        contentId: string;
        type: ContentType;
    }): Promise<'removed' | 'library_not_found' | 'item_not_found'>;
    findById(data: { profileId: string; libraryId: string }): Promise<LibraryWithProfileRecord | null>;
    listItems(data: {
        profileId: string;
        libraryId: string;
        page: number;
        limit: number;
        search?: string;
    }): Promise<ListLibraryItemsResult | null>;
}
