import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { AppError } from '@shared/errors';
import { OriginalVideoVersionNotFoundError, VideoNotFoundError } from '../video.errors';
import type { RichVideo } from '@shared/mappers/video.mapper';
import type { Video, VideoVersion, WatchHistory } from '@shared/schema';
import type { VideoVersionsRepository } from '../videos.ports';

mock.module('../videos.drizzle.repository', () => ({
    drizzleVideosRepository: {},
    drizzleVideoVersionsRepository: {},
    drizzleVideoSubtitlesRepository: {},
}));

mock.module('../video.processor', () => ({
    startProcessing: async () => {},
}));

mock.module('@shared/mappers/video.mapper', () => ({
    toVideoMinDTO: (video: Video) => ({
        id: video.id,
        type: video.type,
        accountId: video.uploaderId,
        duration: video.duration,
        status: video.status,
        createdAt: video.createdAt,
    }),
    toVideoDTO: (video: RichVideo) => ({
        id: video.id,
        type: video.type,
        accountId: video.uploaderId,
        duration: video.duration,
        status: video.status,
        createdAt: video.createdAt,
        user: null,
        versions: video.versions,
        generatedVersions: null,
        subtitles: [],
    }),
    toWatchHistoryDTO: (history: WatchHistory) => history,
    toVideoVersionDTO: (version: VideoVersion) => ({
        id: version.id,
        height: version.height,
        width: version.width,
        status: version.status,
        fileSize: version.fileSize,
        mimeType: version.mimeType,
        streamUrl: `/media/stream/${version.id}/`,
        isOriginal: version.isOriginal,
    }),
}));

mock.module('@utils/taskRegistry', () => ({
    taskRegistry: { kill: async () => true },
}));

mock.module('@utils/taskHandler', () => ({
    taskHandler: { cancel: () => true },
}));

const { createVideoVersionsService } = await import('../services/versions.service');

let versions: VideoVersion[] | null = [];
let videoWithOriginal: (Video & { versions: VideoVersion[] }) | null = null;
let existingVersion: VideoVersion | null = null;
let versionById: VideoVersion | null = null;
const deletedVersionIds: string[] = [];

const repository: VideoVersionsRepository = {
    listByVideoId: async () => versions,
    findVideoWithReadyOriginal: async () => videoWithOriginal,
    findExistingHlsVersion: async () => existingVersion,
    findById: async () => versionById,
    deleteById: async (versionId) => {
        deletedVersionIds.push(versionId);
    },
};

const service = createVideoVersionsService({ videoVersionsRepository: repository });

const makeVideo = (overrides: Partial<Video> = {}): Video => ({
    id: 'video-1',
    uploaderId: null,
    duration: 120,
    status: 'ready',
    type: 'movie',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const makeVersion = (overrides: Partial<VideoVersion> = {}): VideoVersion => ({
    id: 'version-1',
    videoId: 'video-1',
    width: 1920,
    height: 1080,
    isOriginal: true,
    status: 'ready',
    storageKey: 'videos/video-1/original.mp4',
    fileSize: 1000,
    mimeType: 'video/mp4',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

describe('VideoVersionsService', () => {
    beforeEach(() => {
        versions = [makeVersion()];
        videoWithOriginal = { ...makeVideo(), versions: [makeVersion()] };
        existingVersion = null;
        versionById = makeVersion({ id: 'stored-720', isOriginal: false, height: 720, mimeType: 'application/x-mpegURL' });
        deletedVersionIds.length = 0;
    });

    test('getAllVideoVersions maps stored versions to DTOs', async () => {
        const result = await service.getAllVideoVersions('video-1');

        expect(result).toMatchObject([{ id: 'version-1', height: 1080, isOriginal: true }]);
    });

    test('getAllVideoVersions throws when video does not exist', async () => {
        versions = null;

        expect(service.getAllVideoVersions('missing')).rejects.toThrow(AppError);
    });

    test('addVideoVersion throws when video does not exist', async () => {
        videoWithOriginal = null;

        expect(service.addVideoVersion('video-1', 720)).rejects.toThrow(VideoNotFoundError);
    });

    test('addVideoVersion throws when original version is missing', async () => {
        videoWithOriginal = { ...makeVideo(), versions: [] };

        expect(service.addVideoVersion('video-1', 720)).rejects.toThrow(OriginalVideoVersionNotFoundError);
    });

    test('addVideoVersion rejects heights above the original', async () => {
        expect(service.addVideoVersion('video-1', 2160)).rejects.toThrow(AppError);
    });

    test('addVideoVersion rejects duplicate HLS versions', async () => {
        existingVersion = makeVersion({ id: 'stored-720', height: 720, isOriginal: false, mimeType: 'application/x-mpegURL' });

        expect(service.addVideoVersion('video-1', 720)).rejects.toThrow(AppError);
    });

    test('deleteVideoVersion rejects original versions', async () => {
        versionById = makeVersion({ isOriginal: true });

        expect(service.deleteVideoVersion('video-1', 'version-1')).rejects.toThrow(AppError);
        expect(deletedVersionIds).toEqual([]);
    });

    test('deleteVideoVersion deletes non-original versions', async () => {
        expect(service.deleteVideoVersion('video-1', 'stored-720')).resolves.toBe(true);

        expect(deletedVersionIds).toEqual(['stored-720']);
    });
});
