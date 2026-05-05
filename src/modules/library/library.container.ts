import { drizzleLibraryRepository } from './library.drizzle.repository';
import { createLibraryService } from './library.service';

export const libraryService = createLibraryService({
    libraryRepository: drizzleLibraryRepository,
});
