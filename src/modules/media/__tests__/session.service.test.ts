import { beforeEach, describe, expect, test } from 'bun:test';
import { NoVideoMediaFoundError, VideoNotFoundError } from '@modules/media/live.errors';
import { createMediaSessionService } from '@modules/media/session/session.service';
import type { MediaRepository, MediaSessionClient, VideoWithVersions } from '@modules/media/media.ports';
import type { Subtitle, VideoVersion } from '@schema/video.schema';

let video: VideoWithVersions | null = null;
const createdSessions: unknown[] = [];

const mediaRepository: MediaRepository = {
    findVideoWithVersions: async () => video,
    findVideoVersion: async () => null as VideoVersion | null,
    findSubtitle: async () => null as Subtitle | null,
};

const sessionClient: MediaSessionClient = {
    create: async (data) => {
        createdSessions.push(data);
        return 'media-session-1';
    },
    validate: async () => {
        throw new Error('Not used in this test');
    },
};

const service = createMediaSessionService({ mediaRepository, sessionClient });

const makeVideo = (overrides: Partial<VideoWithVersions> = {}) =>
    ({
        id: 'video-1',
        uploaderId: null,
        duration: 120,
        status: 'ready',
        type: 'movie',
        createdAt: '2026-01-01T00:00:00.000Z',
        versions: [
            {
                id: 'version-original',
                videoId: 'video-1',
                width: 1920,
                height: 1080,
                isOriginal: true,
                status: 'ready',
                storageKey: 'videos/video-1/original.mp4',
                fileSize: 1000,
                mimeType: 'video/mp4',
                createdAt: '2026-01-01T00:00:00.000Z',
            },
        ],
        ...overrides,
    }) as VideoWithVersions;

describe('MediaSessionService', () => {
    beforeEach(() => {
        video = makeVideo();
        createdSessions.length = 0;
    });

    test('creates a media session for the original video version', async () => {
        await expect(service.createSession('account-1', 'video-1')).resolves.toBe('media-session-1');

        expect(createdSessions).toEqual([
            {
                accountId: 'account-1',
                videoId: 'video-1',
                original: {
                    storageKey: 'videos/video-1/original.mp4',
                    height: 1080,
                    duration: 120,
                },
            },
        ]);
    });

    test('throws when video does not exist', async () => {
        video = null;

        await expect(service.createSession('account-1', 'video-1')).rejects.toThrow(VideoNotFoundError);
    });

    test('throws when video has no duration', async () => {
        video = makeVideo({ duration: null });

        await expect(service.createSession('account-1', 'video-1')).rejects.toThrow(NoVideoMediaFoundError);
    });

    test('throws when video has no original version', async () => {
        video = makeVideo({ versions: [] });

        await expect(service.createSession('account-1', 'video-1')).rejects.toThrow(NoVideoMediaFoundError);
    });
});
