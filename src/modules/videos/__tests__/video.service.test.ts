import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { AppError } from '@shared/errors';
import { VideoNotFoundError } from '../video.errors';
import type { RichVideo } from '@shared/mappers/video.mapper';
import type { VideoMetadata } from '@shared/services/metadata/metadata.types';
import type { Video, VideoVersion, WatchHistory } from '@shared/schema';
import type { VideoDeleteRecord, VideoProgressRecord, VideoResolveRecord, VideosRepository } from '../videos.ports';

mock.module('../videos.drizzle.repository', () => ({
    drizzleVideosRepository: {},
    drizzleVideoVersionsRepository: {},
    drizzleVideoSubtitlesRepository: {},
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

mock.module('@shared/services/audit.service', () => ({
    createAuditLog: async () => {},
}));

mock.module('@utils/taskRegistry', () => ({
    taskRegistry: { kill: async () => true },
}));

mock.module('@utils/taskHandler', () => ({
    taskHandler: { cancel: () => true },
}));

const { createVideoService } = await import('../services/video.service');

let uploadedVideo: Video | null = null;
let videoById: RichVideo | null = null;
let durationRecord: Pick<Video, 'id' | 'duration'> | null = null;
let existingProgress: WatchHistory | null = null;
let progressRecord: VideoProgressRecord | null = null;
let resolveRecord: VideoResolveRecord | null = null;
const upsertCalls: unknown[] = [];

const videosRepository: VideosRepository = {
    initiateUpload: async () => uploadedVideo!,
    findById: async () => videoById,
    findForDelete: async () => null as VideoDeleteRecord | null,
    deleteById: async () => {},
    findProgress: async () => progressRecord,
    findDuration: async () => durationRecord,
    findExistingProgress: async () => existingProgress,
    upsertProgress: async (data) => {
        upsertCalls.push(data);
        return {
            id: 'history-2',
            profileId: data.profileId,
            videoId: data.videoId,
            lastPosition: data.positionSec,
            isFinished: data.isFinished,
            updatedAt: data.updatedAt,
        };
    },
    findForResolve: async () => resolveRecord,
};

const service = createVideoService({ videosRepository });

const makeVideo = (overrides: Partial<Video> = {}): Video => ({
    id: 'video-1',
    uploaderId: 'account-1',
    duration: 120,
    status: 'ready',
    type: 'movie',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const makeHistory = (overrides: Partial<WatchHistory> = {}): WatchHistory => ({
    id: 'history-1',
    profileId: 'profile-1',
    videoId: 'video-1',
    lastPosition: 40,
    isFinished: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

describe('VideoService', () => {
    beforeEach(() => {
        uploadedVideo = makeVideo();
        videoById = null;
        durationRecord = { id: 'video-1', duration: 100 };
        existingProgress = null;
        progressRecord = null;
        resolveRecord = null;
        upsertCalls.length = 0;
    });

    test('initiateUpload returns a minimal video DTO', async () => {
        const metadata = { type: 'movie' } as VideoMetadata;

        expect(service.initiateUpload(metadata, { accountId: 'account-1', status: 'processing' })).resolves.toMatchObject({
            id: 'video-1',
            type: 'movie',
            accountId: 'account-1',
            status: 'ready',
        });
    });

    test('getVideoById adds generated live versions below the original height', async () => {
        videoById = {
            ...makeVideo({ duration: 120 }),
            uploader: null,
            subtitles: [],
            versions: [
                {
                    id: 'original',
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
                {
                    id: 'stored-720',
                    videoId: 'video-1',
                    width: 1280,
                    height: 720,
                    isOriginal: false,
                    status: 'ready',
                    storageKey: 'videos/video-1/720/index.m3u8',
                    fileSize: 1000,
                    mimeType: 'application/x-mpegURL',
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
            ],
        };

        const video = await service.getVideoById('video-1');

        expect(video.generatedVersions?.map((version) => version.height)).toEqual([480]);
        expect(video.generatedVersions?.[0]?.streamUrl).toContain('/media/live/video-1/480/index.m3u8');
    });

    test('saveVideoProgressById ignores an automatic low-position rewind', async () => {
        existingProgress = makeHistory({ lastPosition: 55 });

        const result = await service.saveVideoProgressById({ videoId: 'video-1', profileId: 'profile-1', positionSec: 10 });

        expect(result.lastPosition).toBe(55);
        expect(upsertCalls).toEqual([]);
    });

    test('saveVideoProgressById marks video as finished after 95 percent', async () => {
        const result = await service.saveVideoProgressById({ videoId: 'video-1', profileId: 'profile-1', positionSec: 96 });

        expect(result.isFinished).toBe(true);
        expect(upsertCalls).toMatchObject([{ videoId: 'video-1', profileId: 'profile-1', positionSec: 96, isFinished: true }]);
    });

    test('saveVideoProgressById throws when video does not exist', async () => {
        durationRecord = null;

        expect(service.saveVideoProgressById({ videoId: 'video-1', profileId: 'profile-1', positionSec: 10 })).rejects.toThrow(
            VideoNotFoundError
        );
    });

    test('resolveVideo returns linked movie content', async () => {
        resolveRecord = { id: 'video-1', type: 'movie', movie: { id: 'movie-1', title: 'Movie' }, episode: null };

        expect(service.resolveVideo('video-1')).resolves.toEqual({ type: 'movie', id: 'movie-1', name: 'Movie' });
    });

    test('resolveVideo rejects inconsistent movie records', async () => {
        resolveRecord = { id: 'video-1', type: 'movie', movie: null, episode: null };

        expect(service.resolveVideo('video-1')).rejects.toThrow(AppError);
    });
});
