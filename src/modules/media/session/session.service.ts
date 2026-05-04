import { NoVideoMediaFoundError, VideoNotFoundError } from '../live/live.errors';
import { sessionClient } from '@modules/media/session/session.client';
import { drizzleMediaRepository } from '../media.drizzle.repository';
import type { MediaRepository, MediaSessionClient } from '../media.ports';

export interface MediaSessionServiceDependencies {
    mediaRepository: MediaRepository;
    sessionClient: MediaSessionClient;
}

export const createMediaSessionService = ({ mediaRepository, sessionClient }: MediaSessionServiceDependencies) => {
    const createSession = async (accountId: string, videoId: string): Promise<string> => {
        const video = await mediaRepository.findVideoWithVersions(videoId);
        if (!video) throw new VideoNotFoundError();

        if (!video.duration) throw new NoVideoMediaFoundError();

        const original = video.versions.find((v) => v.isOriginal);
        if (!original) throw new NoVideoMediaFoundError();

        return await sessionClient.create({
            accountId,
            videoId: video.id,
            original: {
                storageKey: original.storageKey,
                height: original.height,
                duration: video.duration,
            },
        });
    };

    return { createSession };
};

export type MediaSessionService = ReturnType<typeof createMediaSessionService>;

export const mediaSessionService = createMediaSessionService({
    mediaRepository: drizzleMediaRepository,
    sessionClient,
});

export const createSession = mediaSessionService.createSession;
