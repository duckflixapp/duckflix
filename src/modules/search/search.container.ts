import { drizzleSearchRepository } from './search.drizzle.repository';
import { createSearchService } from './search.service';

export const searchService = createSearchService({
    searchRepository: drizzleSearchRepository,
});
