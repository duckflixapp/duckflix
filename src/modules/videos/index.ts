import { Elysia } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { createRateLimit } from '@shared/configs/ratelimit';
import { addVersionSchema, createProgressSchema, createVideoSchema, videoParamsSchema, videoVersionParamsSchema } from './video.validator';
import { AppError } from '@shared/errors';
import { importBodySchema, searchQuerySchema, subtitleParamsSchema, uploadBodySchema } from './subtitles.validator';
import { limits } from '@shared/configs/limits.config';
import { videoService, videoSubtitlesService, videoVersionsService } from './videos.container';
import { saveUploadToTemp } from './upload-temp-file';
import { processUpload } from './video.uploader';

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
                    const videos = await processUpload({ context: body, account: user });

                    set.status = 201;
                    return {
                        status: 'success',
                        message: `Video processing started for ${videos.length} videos.`,
                        data: { videos },
                    };
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
