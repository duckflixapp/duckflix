import { beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '@shared/configs/db';
import { paths } from '@shared/configs/path.config';
import { subtitles, videos, videoVersions } from '@schema/video.schema';
import { drizzleMediaRepository } from '@modules/media/media.drizzle.repository';
import { bunMediaFileStore } from '@modules/media/media.file-store';
import { createLiveMediaService } from '@modules/media/live/live.service';
import { createMediaService } from '@modules/media/media.service';
import { createMediaSessionService } from '@modules/media/session/session.service';
import { InMemorySessionRepository } from '@modules/media/session/session.memory.repository';
import { SessionClient } from '@modules/media/session/session.client';
import type { MediaFile } from '@modules/media/media.ports';

const videoId = 'media-flow-video';
const originalVersionId = 'media-flow-original';
const hlsVersionId = 'media-flow-hls-720';
const subtitleId = 'media-flow-subtitle';

const sessionClient = new SessionClient(new InMemorySessionRepository());

const mediaSessionService = createMediaSessionService({
    mediaRepository: drizzleMediaRepository,
    sessionClient,
});

const mediaService = createMediaService({
    mediaRepository: drizzleMediaRepository,
    sessionClient,
    fileStore: bunMediaFileStore,
    paths: { storage: paths.storage },
});

const liveMediaService = createLiveMediaService({
    mediaRepository: drizzleMediaRepository,
    liveSessionManager: {
        ensureSegment: async () => path.resolve(paths.live, 'fake-session/720/seg-0.ts'),
    },
    baseUrl: 'http://localhost:3001',
});

const resetMediaFixtures = async () => {
    await db.delete(subtitles);
    await db.delete(videoVersions);
    await db.delete(videos);

    await rm(path.resolve(paths.storage, 'integration'), { recursive: true, force: true });
    await mkdir(path.resolve(paths.storage, 'integration/hls'), { recursive: true });
    await mkdir(path.resolve(paths.storage, 'integration/subtitles'), { recursive: true });
    await writeFile(path.resolve(paths.storage, 'integration/hls/index.m3u8'), '#EXTM3U\nseg-0.ts\nsubtitle.vtt');
    await writeFile(path.resolve(paths.storage, 'integration/subtitles/en.vtt'), 'WEBVTT\n\n00:00.000 --> 00:01.000\nHello');

    await db.insert(videos).values({
        id: videoId,
        duration: 13,
        status: 'ready',
        type: 'movie',
    });

    await db.insert(videoVersions).values([
        {
            id: originalVersionId,
            videoId,
            width: 1920,
            height: 1080,
            isOriginal: true,
            status: 'ready',
            storageKey: 'integration/original.mp4',
            mimeType: 'video/mp4',
            fileSize: 10_000,
        },
        {
            id: hlsVersionId,
            videoId,
            width: 1280,
            height: 720,
            isOriginal: false,
            status: 'ready',
            storageKey: 'integration/hls/index.m3u8',
            mimeType: 'application/x-mpegURL',
            fileSize: 1_000,
        },
    ]);

    await db.insert(subtitles).values({
        id: subtitleId,
        videoId,
        name: 'English',
        language: 'en',
        storageKey: 'integration/subtitles/en.vtt',
    });
};

describe('media flow integration', () => {
    beforeEach(async () => {
        await resetMediaFixtures();
    });

    test('creates a session and serves stream, subtitle and live manifests', async () => {
        const session = await mediaSessionService.createSession('account-1', videoId);

        const streamResponse = await mediaService.stream({ versionId: hlsVersionId, session });
        expect(streamResponse.contentType).toBe('application/x-mpegURL');
        expect(streamResponse.body).toContain(`seg-0.ts?session=${session}`);
        expect(streamResponse.body).toContain(`subtitle.vtt?session=${session}`);

        const subtitleResponse = await mediaService.subtitle({ subtitleId, session });
        expect(await (subtitleResponse.body as MediaFile).text()).toContain('WEBVTT');

        const masterManifest = await liveMediaService.generateMasterFile(videoId, session);
        expect(masterManifest).toContain(`http://localhost:3001/media/stream/${hlsVersionId}/index.m3u8?session=${session}`);
        expect(masterManifest).toContain(`http://localhost:3001/media/live/${videoId}/1080/index.m3u8?session=${session}`);

        const { video, original } = await liveMediaService.getVideoWithOriginal(videoId);
        const variantManifest = await liveMediaService.generateManifestFile(video, original, 480, session, { segmentDuration: 6 });
        expect(variantManifest).toContain(`http://localhost:3001/media/live/${videoId}/480/seg-0.ts?session=${session}`);
        expect(variantManifest).toContain('#EXT-X-ENDLIST');
    });
});
