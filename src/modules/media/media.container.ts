import { paths } from '@shared/configs/path.config';
import { sessionClient } from './session/session.client';
import { createMediaSessionService } from './session/session.service';
import { liveMediaService, liveSessionManager } from './live.service';
import { drizzleMediaRepository } from './media.drizzle.repository';
import { bunMediaFileStore } from './media.file-store';
import { createMediaService } from './media.service';
import type { MediaPaths } from './media.ports';

const mediaPaths: MediaPaths = {
    storage: paths.storage,
    live: paths.live,
};

export const mediaRepository = drizzleMediaRepository;

export const mediaSessionService = createMediaSessionService({
    mediaRepository,
    sessionClient,
});

export const mediaService = createMediaService({
    mediaRepository,
    sessionClient,
    fileStore: bunMediaFileStore,
    paths: mediaPaths,
});

export { liveMediaService, liveSessionManager };
