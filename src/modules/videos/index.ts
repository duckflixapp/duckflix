import { Elysia } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { createRateLimit } from '@shared/configs/ratelimit';
import * as MetadataService from '@shared/services/metadata/metadata.service';
import { addVersionSchema, createProgressSchema, createVideoSchema, videoParamsSchema, videoVersionParamsSchema } from './video.validator';
import { AppError } from '@shared/errors';
import fs from 'node:fs/promises';
import { importBodySchema, searchQuerySchema, subtitleParamsSchema, uploadBodySchema } from './subtitles.validator';
import { limits } from '@shared/configs/limits.config';
import { videoService, videoSubtitlesService, videoVersionsService } from './videos.container';
import { saveUploadToTemp } from './upload-temp-file';
import { videoProcessorRegistry, type VideoProcessorContext } from './imports';
import { logger } from '@shared/configs/logger';
import { DownloadCancelledError } from './imports/video-processor.ports';
import { downloadRegistry } from './workflows/download.registry';
import { db } from '@shared/configs/db';
import { videos } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { processVideoWorkflow } from './workflows/video.workflow';
import { emitVideoProgress, handleWorkflowError } from './video.handler';
import { notifyJobStatus } from '@shared/services/notifications/notification.helper';
import { identifyVideoWorkflow } from './workflows/identify.workflow';

const uploadLimiter = createRateLimit({ max: 20, duration: 30000 });
const standardLimiter = createRateLimit({ max: 30, duration: 3000 });
const addonContext = (videoId?: string, accountId?: string) =>
    ({
        error: (message, options) => new AppError(message, options),
        emit: async (event) => {
            if (event.type === 'progress') {
                if (!videoId) return;
                await emitVideoProgress(videoId, event.phase, event.progress);
            }

            if (event.type === 'status') {
                if (!videoId || !accountId) return;
                notifyJobStatus(accountId, event.status, event.title, event.message, videoId).catch(() => {});
            }

            if (event.type === 'log') {
                logger[event.level]({ ...event.data, videoId }, event.message);
            }
        },
        download: {
            register: (d) => (videoId ? downloadRegistry.register(videoId, d) : undefined),
            unregister: () => (videoId ? downloadRegistry.unregister(videoId) : undefined),
        },
    }) satisfies VideoProcessorContext;

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

                    const processorAddon = videoProcessorRegistry.resolve(body.processor);
                    if (!processorAddon) throw new AppError('Failed to find processor for: ' + body.processor, { statusCode: 404 });

                    const rawSource =
                        body.sourceType === 'file'
                            ? ({ sourceType: 'file', file: body.source } as const)
                            : ({ sourceType: 'text', value: body.source } as const);

                    const processorRun = await processorAddon.prepareRun();
                    const { processor } = processorRun;
                    const preflightContext = addonContext(undefined, user.id);
                    let savedSourcePath: string | undefined;
                    let cleanupSourceOnError = true;

                    try {
                        videoProcessorRegistry.ensureSourceSupported(processor, rawSource.sourceType);
                        await processor.validateSource(rawSource, preflightContext);

                        const source = rawSource.sourceType === 'file' ? { ...rawSource, tempPath: '' } : rawSource;
                        if (source.sourceType === 'file') {
                            savedSourcePath = await saveUploadToTemp(source.file, processorRun.workspace?.inputDir);
                            source.tempPath = savedSourcePath;
                        }

                        let metadata = await MetadataService.enrichMetadata(dbUrl, body);

                        if (!metadata) metadata = await processor.identify({ source, requestedType: type }, preflightContext);

                        // fallback to default identification
                        if (!metadata && source.sourceType === 'file')
                            metadata = await identifyVideoWorkflow(
                                { fileName: source.file.name, filePath: source.tempPath, type },
                                { checkHash: false }
                            );

                        if (!metadata) {
                            throw new AppError('Failed to retrieve metadata. Please provide valid video data or db url', {
                                statusCode: 400,
                            });
                        }

                        const video = await videoService.initiateUpload(metadata, {
                            accountId: user.id,
                            status: processor.initialStatus ?? 'processing',
                        });

                        processor
                            .start({ metadata, source }, addonContext(video.id, user.id))
                            .then(async ({ fileName, fileSize, path }) => {
                                await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, video.id));

                                processVideoWorkflow({
                                    accountId: user.id,
                                    videoId: video.id,
                                    type: metadata.type,
                                    imdbId: metadata.imdbId,
                                    tempPath: path,
                                    originalName: fileName,
                                    fileSize: fileSize,
                                })
                                    .catch((error) => handleWorkflowError(video.id, error, 'video'))
                                    .finally(() => processorRun.cleanup());
                            })
                            .catch(async (error) => {
                                await processorRun.cleanup();
                                if (
                                    error instanceof DownloadCancelledError ||
                                    (error instanceof Error && error.name == DownloadCancelledError.name)
                                ) {
                                    await db.update(videos).set({ status: 'error' }).where(eq(videos.id, video.id));
                                    logger.info({ videoId: video.id, processor: processor.id }, 'Video import canceled');
                                    return;
                                }

                                await handleWorkflowError(video.id, error, processor.id);
                            });

                        savedSourcePath = undefined;
                        cleanupSourceOnError = false;

                        set.status = 201;
                        return {
                            status: 'success',
                            message: 'Video processing started.',
                            data: { video },
                        };
                    } catch (e) {
                        if (savedSourcePath && cleanupSourceOnError) await fs.unlink(savedSourcePath).catch(() => {});
                        await processorRun.cleanup();
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
                '/:id/download',
                async ({ params: { id } }) => {
                    await videoService.cancelVideoDownload(id);
                    return {
                        status: 'success',
                        message: 'Video download canceled.',
                    };
                },
                { params: videoParamsSchema, detail: { summary: 'Cancel Download' } }
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
