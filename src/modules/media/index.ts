import { Elysia } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { createRateLimit } from '@shared/configs/ratelimit';
import * as MediaController from './media.controller';
import {
    createSessionBodySchema,
    authQuerySchema,
    streamParamsSchema,
    subtitleParamsSchema,
    liveMasterSchema,
    liveManifestSchema,
    liveSegmentSchema,
} from './media.validator';
import { AppError } from '@shared/errors';
import { sessionGuard } from './media.middleware';
import { liveMediaService, mediaRepository, mediaSessionService } from './media.container';

const defaultLimiter = createRateLimit({ max: 30, duration: 3000 });
const streamLimiter = createRateLimit({ max: 30, duration: 1000 });

export const mediaRouter = new Elysia({ prefix: '/media' })
    .use(authGuard)
    .use(sessionGuard)
    .use(defaultLimiter)
    .post(
        '/session',
        async ({ user, body: { videoId } }) => {
            const sessionId = await mediaSessionService.createSession(user.id, videoId);
            return { status: 'success', data: { sessionId } };
        },
        {
            body: createSessionBodySchema,
            auth: true,
            detail: { tags: ['Media'], summary: 'Create Session' },
        }
    )
    .group('/stream', { detail: { tags: ['Streaming'] } }, (app) =>
        app
            .use(streamLimiter)
            .guard({
                mediaSession: async ({ params: { versionId } }) => {
                    const version = await mediaRepository.findVideoVersion(versionId!);
                    if (!version) throw new AppError('Version not found', { statusCode: 404 });
                    return version.videoId;
                },
            })
            .get('/:versionId', MediaController.handleStream, {
                params: streamParamsSchema,
                query: authQuerySchema,
                detail: { summary: 'Default' },
            })
            .get('/:versionId/:file', MediaController.handleStream, {
                params: streamParamsSchema,
                query: authQuerySchema,
                detail: { summary: 'Specific' },
            })
    )

    .group('/subtitles', { detail: { tags: ['Subtitles'] } }, (app) =>
        app
            .use(defaultLimiter)
            .guard({
                mediaSession: async ({ params: { subtitleId } }) => {
                    const sub = await mediaRepository.findSubtitle(subtitleId!);
                    if (!sub) throw new AppError('Subtitle not found', { statusCode: 404 });

                    return sub!.videoId;
                },
            })
            .get('/:subtitleId', MediaController.handleSubtitle, {
                detail: { tags: ['Streaming'], summary: 'VTT File' },
                params: subtitleParamsSchema,
                query: authQuerySchema,
            })
    )

    .group('/live/:videoId', { detail: { tags: ['Live Streaming'] } }, (app) =>
        app
            .use(streamLimiter)
            .guard({ mediaSession: ({ params }) => params.videoId })
            .get(
                '/master.m3u8',
                async ({ params: { videoId }, mediaSession }) => {
                    const master = await liveMediaService.generateMasterFile(videoId, mediaSession.id);
                    return new Response(master, { headers: { 'Content-Type': 'application/x-mpegURL' } });
                },
                { query: authQuerySchema, params: liveMasterSchema, detail: { summary: 'Master Playlist' } }
            )

            .get(
                '/:height/index.m3u8',
                async ({ params: { videoId, height }, mediaSession }) => {
                    const { video, original } = await liveMediaService.getVideoWithOriginal(videoId);
                    const m3u8 = await liveMediaService.generateManifestFile(video, original, height, mediaSession.id, {
                        segmentDuration: 6,
                    });
                    return new Response(m3u8, { headers: { 'Content-Type': 'application/x-mpegURL' } });
                },
                { query: authQuerySchema, params: liveManifestSchema, detail: { summary: 'HLS Manifest' } }
            )

            .get(
                '/:height/:segmentName',
                async ({ params: { height, segmentName }, mediaSession }) => {
                    const indexMatch = segmentName.match(/\d+/);
                    if (!indexMatch) throw new AppError('Invalid segment name', { statusCode: 400 });

                    const path = await liveMediaService.ensureLiveSegment(mediaSession.id, height, mediaSession.data.original, {
                        segment: parseInt(indexMatch[0]),
                        segmentDuration: 6,
                    });

                    return Bun.file(path);
                },
                {
                    afterHandle({ set }) {
                        set.headers['cache-control'] = 'public, max-age=31536000, immutable';
                        set.headers['content-type'] = 'video/MP2T';
                    },
                    query: authQuerySchema,
                    params: liveSegmentSchema,
                    detail: { summary: 'HLS Stream segments' },
                }
            )
    );
