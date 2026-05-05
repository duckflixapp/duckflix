import { beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { errorPlugin } from '@shared/errors';
import { db } from '@shared/configs/db';
import { accounts, movies, profiles, sessions, videos, videoVersions, watchHistory } from '@shared/schema';
import { signToken } from '@utils/jwt';

const accountId = '00000000-0000-4000-8000-000000000101';
const profileId = '00000000-0000-4000-8000-000000000102';
const sessionId = '00000000-0000-4000-8000-000000000103';
const videoId = '00000000-0000-4000-8000-000000000201';
const movieId = '00000000-0000-4000-8000-000000000202';
const originalVersionId = '00000000-0000-4000-8000-000000000301';
const hlsVersionId = '00000000-0000-4000-8000-000000000302';
const csrfToken = 'video-flow-csrf';

const { videoRouter } = await import('@modules/videos');
const app = new Elysia().use(errorPlugin).use(videoRouter);

type TestRequestInit = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };
type VideoDetailsResponse = {
    data: {
        video: {
            id: string;
            type: string;
            accountId: string | null;
            duration: number | null;
            status: string;
            versions: unknown[];
            generatedVersions: Array<{ height: number }>;
        };
    };
};
type VideoVersionsResponse = { data: { versions: Array<{ id: string }> } };

const accessToken = () =>
    signToken({
        sub: accountId,
        role: 'contributor',
        isVerified: true,
        sid: sessionId,
        profileId,
    });

const authHeaders = (extra?: Record<string, string>) => ({
    authorization: `Bearer ${accessToken()}`,
    cookie: `csrf_token=${csrfToken}`,
    'x-csrf-token': csrfToken,
    ...extra,
});

const request = (path: string, init?: TestRequestInit) =>
    app.handle(
        new Request(`http://localhost${path}`, {
            ...init,
            headers: authHeaders(init?.headers),
        })
    );

const resetVideoFixtures = async () => {
    await db.delete(watchHistory).where(eq(watchHistory.profileId, profileId));
    await db.delete(videoVersions).where(eq(videoVersions.videoId, videoId));
    await db.delete(movies).where(eq(movies.id, movieId));
    await db.delete(videos).where(eq(videos.id, videoId));
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    await db.delete(profiles).where(eq(profiles.id, profileId));
    await db.delete(accounts).where(eq(accounts.id, accountId));

    await db.insert(accounts).values({
        id: accountId,
        email: 'video-flow@example.com',
        password: 'password',
        verified_email: true,
        role: 'contributor',
    });

    await db.insert(profiles).values({
        id: profileId,
        accountId,
        name: 'Video Flow',
    });

    await db.insert(sessions).values({
        id: sessionId,
        accountId,
        token: 'video-flow-refresh-token',
        expiresAt: '2099-01-01T00:00:00.000Z',
    });

    await db.insert(videos).values({
        id: videoId,
        uploaderId: accountId,
        duration: 100,
        status: 'ready',
        type: 'movie',
    });

    await db.insert(movies).values({
        id: movieId,
        videoId,
        title: 'Integration Movie',
        overview: 'A routed video integration fixture.',
        releaseYear: 2026,
    });

    await db.insert(videoVersions).values([
        {
            id: originalVersionId,
            videoId,
            width: 1920,
            height: 1080,
            isOriginal: true,
            status: 'ready',
            storageKey: 'integration/video-flow/original.mp4',
            fileSize: 10_000,
            mimeType: 'video/mp4',
        },
        {
            id: hlsVersionId,
            videoId,
            width: 1280,
            height: 720,
            isOriginal: false,
            status: 'ready',
            storageKey: 'integration/video-flow/720/index.m3u8',
            fileSize: 1_000,
            mimeType: 'application/x-mpegURL',
        },
    ]);
};

describe('video flow integration', () => {
    beforeEach(async () => {
        await resetVideoFixtures();
    });

    test('serves video details, resolves content, saves progress and deletes a stored version', async () => {
        const detailsResponse = await request(`/videos/${videoId}`);
        expect(detailsResponse.status).toBe(200);

        const details = (await detailsResponse.json()) as VideoDetailsResponse;
        expect(details.data.video).toMatchObject({
            id: videoId,
            type: 'movie',
            accountId,
            duration: 100,
            status: 'ready',
        });
        expect(details.data.video.versions).toHaveLength(2);
        expect(details.data.video.generatedVersions.map((version) => version.height)).toEqual([480]);

        const resolveResponse = await request(`/videos/${videoId}/resolve`);
        expect(resolveResponse.status).toBe(200);
        expect(resolveResponse.json()).resolves.toMatchObject({
            data: { content: { type: 'movie', id: movieId, name: 'Integration Movie' } },
        });

        const emptyProgressResponse = await request(`/videos/${videoId}/progress`);
        expect(emptyProgressResponse.status).toBe(200);
        expect(emptyProgressResponse.json()).resolves.toMatchObject({
            data: { watchHistory: null },
        });

        const saveProgressResponse = await request(`/videos/${videoId}/progress`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ positionSec: 96 }),
        });
        expect(saveProgressResponse.status).toBe(200);
        expect(saveProgressResponse.json()).resolves.toMatchObject({
            data: { watchHistory: { profileId, videoId, lastPosition: 96, isFinished: true } },
        });

        const versionsResponse = await request(`/videos/${videoId}/versions/`);
        expect(versionsResponse.status).toBe(200);
        const versions = (await versionsResponse.json()) as VideoVersionsResponse;
        expect(versions.data.versions.map((version) => version.id).sort()).toEqual([hlsVersionId, originalVersionId].sort());

        const deleteVersionResponse = await request(`/videos/${videoId}/versions/${hlsVersionId}`, { method: 'DELETE' });
        expect(deleteVersionResponse.status).toBe(204);

        const deletedVersion = await db.query.videoVersions.findFirst({ where: eq(videoVersions.id, hlsVersionId) });
        expect(deletedVersion).toBeUndefined();

        const originalVersion = await db.query.videoVersions.findFirst({ where: eq(videoVersions.id, originalVersionId) });
        expect(originalVersion).toMatchObject({ id: originalVersionId });
    });
});
