import type { PaginatedResponse, ContentDTO } from '@duckflixapp/shared';

import { toContentDTOFromRow } from '@shared/mappers/content.mapper';
import type { SearchOptions, SearchRepository } from './search.ports';

type SearchServiceDependencies = {
    searchRepository: SearchRepository;
};

export const createSearchService = ({ searchRepository }: SearchServiceDependencies) => {
    const unifiedSearch = async (options: SearchOptions): Promise<PaginatedResponse<ContentDTO>> => {
        const { results, total } = await searchRepository.unifiedSearch(options);

        return {
            data: results.map(toContentDTOFromRow),
            meta: {
                totalItems: total,
                itemCount: results.length,
                itemsPerPage: options.limit,
                totalPages: Math.ceil(total / options.limit),
                currentPage: options.page,
            },
        };
    };

    return {
        unifiedSearch,
    };
};

export type SearchService = ReturnType<typeof createSearchService>;
