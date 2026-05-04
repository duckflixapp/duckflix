import { Elysia } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { createRateLimit } from '@shared/configs/ratelimit';
import * as MetadataService from '@shared/services/metadata/metadata.service';
import { addVersionSchema, createProgressSchema, createVideoSchema, videoParamsSchema, videoVersionParamsSchema } from './video.validator';
import { identifyVideoWorkflow } from './workflows/identify.workflow';
import { processVideoWorkflow } from './workflows/video.workflow';
import { processTorrentFileWorkflow } from './workflows/torrent.workflow';
import { handleWorkflowError } from './video.handler';
import { AppError } from '@shared/errors';
import fs from 'node:fs/promises';
import { importBodySchema, searchQuerySchema, subtitleParamsSchema, uploadBodySchema } from './subtitles.validator';
import { limits } from '@shared/configs/limits.config';
import { videoService, videoSubtitlesService, videoVersionsService } from './videos.container';
import { saveUploadToTemp } from './upload-temp-file';

const uploadLimiter = createRateLimit({ max: 20, duration: 30000 });
const standardLimiter = createRateLimit({ max: 30, duration: 3000 });

export const videoRouter = new Elysia({ prefix: '/videos', detail: { tags: ['Videos'] } })
    .use(authGuard)
    .use(standardLimiter)
    .guard({ auth: true })
    .get(
        '/:id',
        async ({ params: { id } }) => {
            const video = await videoService.getVideoById(id);
            return { status: 'success', data: { video } };
        },
        { params: videoParamsSchema, detail: { summary: 'Details' } }
    )

    .get(
        '/:id/progress',
        async ({ user, params: { id } }) => {
            const watchHistory = await videoService.getVideoProgressById({ profileId: user.profileId!, videoId: id });
            return { status: 'success', data: { watchHistory } };
        },
        { params: videoParamsSchema, detail: { summary: 'Progress' } }
    )

    .post(
        '/:id/progress',
        async ({ user, params: { id }, body: { positionSec } }) => {
            const watchHistory = await videoService.saveVideoProgressById({ profileId: user.profileId!, videoId: id, positionSec });
            return { status: 'success', data: { watchHistory } };
        },
        { params: videoParamsSchema, body: createProgressSchema, detail: { summary: 'Save Progress' } }
    )

    .get(
        '/:id/resolve',
        async ({ params: { id } }) => {
            const content = await videoService.resolveVideo(id);
            return { status: 'success', data: { content } };
        },
        { params: videoParamsSchema, detail: { summary: 'Resolve' } }
    )

    .group('', (app) =>
        app
            .guard({ auth: 'contributor' })

            .post(
                '/upload',
                async ({ user, body, set }) => {
                    const { type, dbUrl } = body;

                    const videoFile = body.video;
                    const torrentFile = body.torrent;

                    if (!videoFile && !torrentFile)
                        throw new AppError('Please provide either a valid video or torrent file', { statusCode: 400 });

                    if (videoFile) {
                        if (videoFile.size > limits.file.upload * 1024 * 1024) {
                            throw new AppError('Video file exceeds maximum allowed size.', { statusCode: 400 });
                        }

                        const isValidMime = videoFile.type.startsWith('video/') || videoFile.type === 'application/octet-stream';
                        if (!isValidMime) {
                            throw new AppError('Only video files (mp4, mkv, avi, mov) are allowed', { statusCode: 400 });
                        }
                    }

                    if (torrentFile) {
                        if (torrentFile.size > 5 * 1024 * 1024) {
                            throw new AppError('Torrent file is suspiciously large', { statusCode: 400 });
                        }

                        const isTorrentMime = torrentFile.type === 'application/x-bittorrent';
                        const isTorrentExt = torrentFile.name.toLowerCase().endsWith('.torrent');

                        if (!isTorrentMime && !isTorrentExt) {
                            throw new AppError('The "torrent" field must contain a .torrent file.', { statusCode: 400 });
                        }
                    }

                    let savedVideoPath: string | undefined;
                    let savedTorrentPath: string | undefined;

                    try {
                        if (videoFile) {
                            savedVideoPath = await saveUploadToTemp(videoFile);
                        }
                        if (torrentFile) {
                            savedTorrentPath = await saveUploadToTemp(torrentFile);
                        }

                        let metadata = await MetadataService.enrichMetadata(dbUrl, body);

                        if (!metadata && savedVideoPath) {
                            metadata = await identifyVideoWorkflow({
                                filePath: savedVideoPath,
                                fileName: videoFile!.name,
                                type,
                            });
                        }
                        if (!metadata && savedTorrentPath) {
                            metadata = await identifyVideoWorkflow(
                                { filePath: savedTorrentPath, fileName: torrentFile!.name, type },
                                { checkHash: false }
                            );
                        }

                        if (!metadata) {
                            throw new AppError('Failed to retrieve metadata. Please provide valid video data or db url', {
                                statusCode: 400,
                            });
                        }

                        const video = await videoService.initiateUpload(metadata, {
                            accountId: user.id,
                            status: videoFile ? 'processing' : 'downloading',
                        });

                        if (videoFile && savedVideoPath) {
                            processVideoWorkflow({
                                accountId: user.id,
                                videoId: video.id,
                                type: metadata.type,
                                imdbId: metadata.imdbId,
                                tempPath: savedVideoPath,
                                originalName: videoFile.name,
                                fileSize: videoFile.size,
                            }).catch((e) => handleWorkflowError(video.id, e, 'video'));
                        } else if (savedTorrentPath) {
                            processTorrentFileWorkflow({
                                accountId: user.id,
                                videoId: video.id,
                                type: metadata.type,
                                imdbId: metadata.imdbId,
                                torrentPath: savedTorrentPath,
                            }).catch((e) => handleWorkflowError(video.id, e, 'torrent'));
                        }

                        set.status = 201;
                        return {
                            status: 'success',
                            message: torrentFile ? 'Torrent download initiated.' : 'Video processing started.',
                            data: { video },
                        };
                    } catch (e) {
                        if (savedVideoPath) await fs.unlink(savedVideoPath).catch(() => {});
                        if (savedTorrentPath) await fs.unlink(savedTorrentPath).catch(() => {});
                        throw e;
                    }
                },
                {
                    use: uploadLimiter,
                    type: 'multipart',
                    body: createVideoSchema,
                    detail: { summary: 'Upload' },
                }
            )

            .delete(
                '/:id',
                async ({ params: { id }, user, set }) => {
                    await videoService.deleteVideoById(id, { accountId: user.id });
                    set.status = 204;
                },
                { params: videoParamsSchema, detail: { summary: 'Remove' } }
            )

            .group('/:id/versions', (app) =>
                app
                    .get(
                        '/',
                        async ({ params: { id } }) => {
                            const versions = await videoVersionsService.getAllVideoVersions(id);
                            return { status: 'success', data: { versions } };
                        },
                        { params: videoParamsSchema, detail: { tags: ['Video Versions'], summary: 'List Versions' } }
                    )

                    .post(
                        '/',
                        async ({ params: { id }, body, set }) => {
                            await videoVersionsService.addVideoVersion(id, body.height);
                            set.status = 201;
                            return { status: 'success' };
                        },
                        { params: videoParamsSchema, body: addVersionSchema, detail: { tags: ['Video Versions'], summary: 'Add Version' } }
                    )

                    .delete(
                        '/:versionId',
                        async ({ params: { id, versionId }, set }) => {
                            await videoVersionsService.deleteVideoVersion(id, versionId);
                            set.status = 204;
                        },
                        { params: videoVersionParamsSchema, detail: { tags: ['Video Versions'], summary: 'Remove Version' } }
                    )
            )

            .group('/:id/subtitles', (app) =>
                app
                    .post(
                        '/',
                        async ({ params: { id: videoId }, body: { language, subtitle: subtitleFile }, set }) => {
                            if (!subtitleFile) throw new AppError('Please provide a valid subtitle file', { statusCode: 400 });

                            if (subtitleFile.size > limits.file.subtitle) {
                                // 5MB limit
                                throw new AppError('Subtitle file exceeds maximum size of 5MB', { statusCode: 400 });
                            }

                            const allowedExtensions = ['.srt', '.vtt', '.ass', '.ssa', '.sub'];
                            const ext = subtitleFile.name.toLowerCase().slice(subtitleFile.name.lastIndexOf('.'));

                            if (!allowedExtensions.includes(ext)) {
                                throw new AppError(`Unsupported subtitle format. Allowed: ${allowedExtensions.join(', ')}`, {
                                    statusCode: 400,
                                });
                            }

                            const tempPath = await saveUploadToTemp(subtitleFile);

                            const subtitle = await videoSubtitlesService.saveSubtitle({
                                videoId,
                                tempPath,
                                originalName: subtitleFile.name,
                                language,
                            });

                            set.status = 201;
                            return { status: 'success', data: { subtitle } };
                        },
                        {
                            type: 'multipart',
                            params: videoParamsSchema,
                            body: uploadBodySchema,
                            detail: { tags: ['Video Subtitles'], summary: 'Upload' },
                        }
                    )

                    .delete(
                        '/:subtitleId',
                        async ({ params: { id: videoId, subtitleId }, set }) => {
                            await videoSubtitlesService.deleteSubtitleById({ videoId, subtitleId });
                            set.status = 204;
                        },
                        { params: subtitleParamsSchema, detail: { tags: ['Video Subtitles'], summary: 'Remove' } }
                    )

                    .get(
                        '/search',
                        async ({ params: { id }, query: { language } }) => {
                            const subtitles = await videoSubtitlesService.searchOpenSubtitles({ videoId: id, language });
                            return { status: 'success', data: { subtitles } };
                        },
                        { params: videoParamsSchema, query: searchQuerySchema, detail: { tags: ['Video Subtitles'], summary: 'Search' } }
                    )

                    .post(
                        '/import',
                        async ({ params: { id }, body, set }) => {
                            const { fileId } = importBodySchema.parse(body);
                            const subtitle = await videoSubtitlesService.importOpenSubtitles({ videoId: id, fileId });
                            set.status = 201;
                            return { status: 'success', data: { subtitle } };
                        },
                        {
                            params: videoParamsSchema,
                            body: importBodySchema,
                            detail: { tags: ['Video Subtitles'], summary: 'External Import' },
                        }
                    )
            )
    );
