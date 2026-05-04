import type { MediaFileStore } from './media.ports';

export const bunMediaFileStore: MediaFileStore = {
    file: (filePath) => Bun.file(filePath),
};
