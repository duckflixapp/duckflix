import { beforeEach, describe, expect, test } from 'bun:test';
import { NotStandardResolutionError, NoVideoMediaFoundError, TooBigResolutionError, VideoNotFoundError } from '@modules/media/live.errors';
import type { MediaRepository, VideoWithVersions } from '@modules/media/media.ports';
import type { Subtitle, VideoVersion } from '@schema/video.schema';

const { createLiveMediaService } = await import('@modules/media/live.service');

let video: VideoWithVersions | null = null;
const ensuredSegments: unknown[] = [];

const mediaRepository: MediaRepository = {
    findVideoWithVersions: async () => video,
    findVideoVersion: async () => null as VideoVersion | null,
    findSubtitle: async () => null as Subtitle | null,
};

const liveSessionManager = {
    ensureSegment: async (...args: unknown[]) => {
        ensuredSegments.push(args);
        return '/live/session-1/720/seg-2.ts';
    },
};

const service = createLiveMediaService({
    mediaRepository,
    liveSessionManager,
    baseUrl: 'http://localhost:3001',
});

const version = (overrides: Partial<VideoVersion> = {}) =>
    ({
        id: 'version-1',
        videoId: 'video-1',
        width: 1920,
        height: 1080,
        isOriginal: false,
        status: 'ready',
        storageKey: 'videos/video-1/hls/index.m3u8',
        fileSize: 1000,
        mimeType: 'application/x-mpegURL',
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    }) as VideoVersion;

const makeVideo = (overrides: Partial<VideoWithVersions> = {}) =>
    ({
        id: 'video-1',
        uploaderId: null,
        duration: 13,
        status: 'ready',
        type: 'movie',
        createdAt: '2026-01-01T00:00:00.000Z',
        versions: [
            version({
                id: 'original',
                width: 1920,
                height: 1080,
                isOriginal: true,
                storageKey: 'videos/video-1/original.mp4',
                mimeType: 'video/mp4',
            }),
            version({ id: 'hls-720', width: 1280, height: 720 }),
        ],
        ...overrides,
    }) as VideoWithVersions;

describe('LiveMediaService', () => {
    beforeEach(() => {
        video = makeVideo();
        ensuredSegments.length = 0;
    });

    test('generates master manifest from stored and live variants', async () => {
        const master = await service.generateMasterFile('video-1', 'session-1');

        expect(master).toContain('#EXTM3U');
        expect(master).toContain('http://localhost:3001/media/live/video-1/1080/index.m3u8?session=session-1');
        expect(master).toContain('http://localhost:3001/media/stream/hls-720/index.m3u8?session=session-1');
        expect(master).toContain('http://localhost:3001/media/live/video-1/480/index.m3u8?session=session-1');
    });

    test('generates a VOD manifest with rounded final segment duration', async () => {
        const currentVideo = makeVideo({ duration: 13 });
        const original = currentVideo.versions.find((item) => item.isOriginal)!;

        const manifest = await service.generateManifestFile(currentVideo, original, 480, 'session-1', { segmentDuration: 6 });

        expect(manifest).toContain('#EXT-X-TARGETDURATION:6');
        expect(manifest).toContain('#EXTINF:6.000000,\nhttp://localhost:3001/media/live/video-1/480/seg-0.ts?session=session-1');
        expect(manifest).toContain('#EXTINF:1.000000,\nhttp://localhost:3001/media/live/video-1/480/seg-2.ts?session=session-1');
        expect(manifest.endsWith('#EXT-X-ENDLIST')).toBe(true);
    });

    test('rejects unknown or incomplete video media', async () => {
        video = null;
        await expect(service.getVideoWithOriginal('video-1')).rejects.toThrow(VideoNotFoundError);

        video = makeVideo({ duration: null });
        await expect(service.getVideoWithOriginal('video-1')).rejects.toThrow(NoVideoMediaFoundError);

        video = makeVideo({ versions: [] });
        await expect(service.getVideoWithOriginal('video-1')).rejects.toThrow(NoVideoMediaFoundError);
    });

    test('rejects invalid manifest resolutions', async () => {
        const currentVideo = makeVideo();
        const original = currentVideo.versions.find((item) => item.isOriginal)!;

        await expect(service.generateManifestFile(currentVideo, original, 2160, 'session-1')).rejects.toThrow(TooBigResolutionError);
        await expect(service.generateManifestFile(currentVideo, original, 999, 'session-1')).rejects.toThrow(NotStandardResolutionError);
    });

    test('delegates live segment creation to the session manager', async () => {
        await expect(
            service.ensureLiveSegment(
                'session-1',
                720,
                { storageKey: 'videos/video-1/original.mp4', height: 1080, duration: 13 },
                {
                    segment: 2,
                    segmentDuration: 6,
                }
            )
        ).resolves.toBe('/live/session-1/720/seg-2.ts');

        expect(ensuredSegments).toEqual([
            [
                'session-1',
                720,
                { storageKey: 'videos/video-1/original.mp4', height: 1080, duration: 13 },
                { segment: 2, segmentDuration: 6 },
            ],
        ]);
    });
});
