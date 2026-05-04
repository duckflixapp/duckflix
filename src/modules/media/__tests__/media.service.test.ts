import { beforeEach, describe, expect, test } from 'bun:test';
import { AppError } from '@shared/errors';
import { createMediaService } from '@modules/media/media.service';
import type { MediaFile, MediaFileStore, MediaRepository, MediaSessionClient, VideoWithVersions } from '@modules/media/media.ports';
import type { Subtitle, VideoVersion } from '@schema/video.schema';

const videoVersions = new Map<string, VideoVersion>();
const subtitles = new Map<string, Subtitle>();
const filePaths: string[] = [];
const validations: Array<{ id: string; videoId: string }> = [];

let fileExists = true;
let fileText = '';

const mediaRepository: MediaRepository = {
    findVideoWithVersions: async (_videoId: string) => null as VideoWithVersions | null,
    findVideoVersion: async (versionId) => videoVersions.get(versionId) ?? null,
    findSubtitle: async (subtitleId) => subtitles.get(subtitleId) ?? null,
};

const sessionClient: MediaSessionClient = {
    create: async () => 'session-id',
    validate: async (id, videoId) => {
        validations.push({ id, videoId });
        return {
            id,
            data: {
                accountId: 'account-1',
                videoId,
                original: { storageKey: 'videos/video-1/original.mp4', height: 1080, duration: 120 },
                expiresAt: Date.now() + 1000,
            },
        };
    },
};

const fileStore: MediaFileStore = {
    file: (filePath) => {
        filePaths.push(filePath);
        return {
            exists: async () => fileExists,
            text: async () => fileText,
        } as MediaFile;
    },
};

const service = createMediaService({
    mediaRepository,
    sessionClient,
    fileStore,
    paths: { storage: '/storage' },
});

const makeVersion = (overrides: Partial<VideoVersion> = {}) =>
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

const makeSubtitle = (overrides: Partial<Subtitle> = {}) =>
    ({
        id: 'subtitle-1',
        videoId: 'video-1',
        name: 'English',
        language: 'en',
        storageKey: 'videos/video-1/subtitles/en.vtt',
        externalId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    }) as Subtitle;

describe('MediaService', () => {
    beforeEach(() => {
        videoVersions.clear();
        subtitles.clear();
        filePaths.length = 0;
        validations.length = 0;
        fileExists = true;
        fileText = '#EXTM3U\nseg-0.ts';
    });

    test('streams HLS manifests with session query appended', async () => {
        videoVersions.set('version-1', makeVersion());

        const response = await service.stream({ versionId: 'version-1', session: 'session-1' });

        expect(response.contentType).toBe('application/x-mpegURL');
        expect(response.body).toBe('#EXTM3U\nseg-0.ts?session=session-1');
        expect(filePaths).toEqual(['/storage/videos/video-1/hls/index.m3u8']);
        expect(validations).toEqual([{ id: 'session-1', videoId: 'video-1' }]);
    });

    test('streams HLS segment files with video/MP2T content type', async () => {
        videoVersions.set('version-1', makeVersion());

        const response = await service.stream({ versionId: 'version-1', file: 'seg-0.ts', session: 'session-1' });

        expect(response.contentType).toBe('video/MP2T');
        expect(filePaths).toEqual(['/storage/videos/video-1/hls/seg-0.ts']);
    });

    test('ignores requested files for non-HLS versions', async () => {
        videoVersions.set(
            'version-1',
            makeVersion({
                storageKey: 'videos/video-1/original.mp4',
                mimeType: 'video/mp4',
                isOriginal: true,
            })
        );

        const response = await service.stream({ versionId: 'version-1', file: 'seg-0.ts', session: 'session-1' });

        expect(response.contentType).toBe('video/mp4');
        expect(filePaths).toEqual(['/storage/videos/video-1/original.mp4']);
    });

    test('rejects unsafe HLS file names before reading storage', async () => {
        videoVersions.set('version-1', makeVersion());

        await expect(service.stream({ versionId: 'version-1', file: '../secret.ts', session: 'session-1' })).rejects.toThrow(AppError);
        expect(filePaths).toEqual([]);
    });

    test('returns subtitle file after validating the media session', async () => {
        subtitles.set('subtitle-1', makeSubtitle());

        const response = await service.subtitle({ subtitleId: 'subtitle-1', session: 'session-1' });

        expect(response.body).toBeDefined();
        expect(filePaths).toEqual(['/storage/videos/video-1/subtitles/en.vtt']);
        expect(validations).toEqual([{ id: 'session-1', videoId: 'video-1' }]);
    });
});
