import { AppError } from '@shared/errors';
import { videoProcessorRegistry } from './imports/video-processor.registry';
import type { CreateVideoInput } from './video.validator';
import type { VideoProcessorContext } from './imports';
import { downloadRegistry } from './workflows/download.registry';
import { logger } from '@shared/configs/logger';
import { notifyJobStatus } from '@shared/services/notifications/notification.helper';
import { emitVideoProgress, handleWorkflowError } from './video.handler';
import { enrichMetadata, resolveMetadata } from '@shared/services/metadata/metadata.service';
import { episodeMetadataSchema, movieMetadataSchema } from '@shared/services/metadata/metadata.validator';
import { videoService } from './videos.container';
import { saveUploadToTemp } from './upload-temp-file';
import type { VideoMetadata, VideoProcessorScanItem, VideoProcessorStartItem } from '@duckflixapp/addon-sdk/types';
import { identifyVideoWorkflow } from './workflows/identify.workflow';
import { processVideoWorkflow } from './workflows/video.workflow';
import { db } from '@shared/configs/db';
import { videos } from '@shared/schema';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { DownloadCancelledError } from './imports/video-processor.ports';
import fs from 'node:fs/promises';
import type { VideoMinDTO } from '@duckflixapp/shared';

type CreatedVideo = Awaited<ReturnType<typeof videoService.initiateUpload>>;

const validateUploadMetadata = (
    metadata: unknown,
    data: { requestedType: CreateVideoInput['type']; source: string; itemId: string; processorId: string }
): VideoMetadata | null => {
    if (!metadata) return null;

    const metadataType = typeof metadata === 'object' && metadata !== null && 'type' in metadata ? metadata.type : undefined;
    if (metadataType !== data.requestedType) {
        logger.warn({ ...data, metadataType }, 'Rejected upload metadata because it does not match the requested video type');
        return null;
    }

    const parsed = data.requestedType === 'movie' ? movieMetadataSchema.safeParse(metadata) : episodeMetadataSchema.safeParse(metadata);

    if (!parsed.success) {
        logger.warn({ ...data, issues: parsed.error.issues }, 'Rejected invalid upload metadata');
        return null;
    }

    return parsed.data as VideoMetadata;
};

const addonContext = (videoIds: string[], accountId?: string) =>
    ({
        error: (message, options) => new AppError(message, options),
        host: {
            metadata: {
                resolve: resolveMetadata,
            },
        },
        emit: async (event) => {
            if (event.type === 'progress') {
                await Promise.all(videoIds.map((videoId) => emitVideoProgress(videoId, event.phase, event.progress)));
            }

            if (event.type === 'status') {
                if (!accountId) return;
                videoIds.forEach((videoId) =>
                    notifyJobStatus(accountId, event.status, event.title, event.message, videoId).catch(() => {})
                );
            }

            if (event.type === 'log') {
                logger[event.level]({ ...event.data, videoIds }, event.message);
            }
        },
        download: {
            register: (d) => videoIds.map((videoId) => downloadRegistry.register(videoId, d)),
            unregister: () => videoIds.map((videoId) => downloadRegistry.unregister(videoId)),
        },
    }) satisfies VideoProcessorContext;

/**
 * Runs the upload/import preflight and returns as soon as video records are created.
 *
 * Source validation, scanning, metadata resolution, and DB record creation happen before
 * the HTTP response. The processor `start` phase and final video processing continue in
 * the background so long-running downloads can keep their per-run workspace until the
 * background chain reaches `processorRun.cleanup()`.
 */
export const processUpload = async ({
    context,
    account,
}: {
    context: CreateVideoInput;
    account: { id: string };
}): Promise<VideoMinDTO[]> => {
    const { type, dbUrl } = context;
    const processorAddon = videoProcessorRegistry.resolve(context.processor);
    if (!processorAddon) throw new AppError('Failed to find processor for: ' + context.processor, { statusCode: 404 });

    const rawSource =
        context.sourceType === 'file'
            ? ({ sourceType: 'file', file: context.source } as const)
            : ({ sourceType: 'text', value: context.source } as const);

    const processorRun = await processorAddon.prepareRun();
    const { processor } = processorRun;
    const preflightContext = addonContext([], account.id);
    let savedSourcePath: string | undefined;

    try {
        videoProcessorRegistry.ensureSourceSupported(processor, rawSource.sourceType);
        await processor.validateSource(rawSource, preflightContext);

        const source = rawSource.sourceType === 'file' ? { ...rawSource, tempPath: '' } : rawSource;
        if (source.sourceType === 'file') {
            savedSourcePath = await saveUploadToTemp(source.file, processorRun.workspace?.inputDir);
            source.tempPath = savedSourcePath;
        }

        const scanItems = await processor.scan({ source, requestedType: type, dbUrl: dbUrl ?? undefined }, preflightContext);
        if (scanItems.length === 0)
            throw new AppError('Failed to find videos.', {
                statusCode: 400,
            });

        const planned: Array<{ item: VideoProcessorScanItem; metadata: VideoMetadata }> = [];

        for (const item of scanItems) {
            const requestedType = item.requestedType ?? type;
            const validationContext = { requestedType, itemId: item.id, processorId: processor.id };

            let metadata = validateUploadMetadata(item.metadata, { ...validationContext, source: 'scan' });

            if (!metadata && scanItems.length === 1 && requestedType === type) {
                const metadataFromUrl = await enrichMetadata(dbUrl, context);
                metadata = validateUploadMetadata(metadataFromUrl, { ...validationContext, source: 'dbUrl' });
            }

            if (!metadata) {
                const identified = await processor.identify(
                    { source: item.source, requestedType, dbUrl: dbUrl ?? undefined },
                    preflightContext
                );
                metadata = validateUploadMetadata(identified, { ...validationContext, source: 'processor.identify' });
            }

            if (!metadata && item.source.sourceType === 'file') {
                metadata = validateUploadMetadata(
                    await identifyVideoWorkflow(
                        {
                            fileName: item.title,
                            filePath: item.source.tempPath,
                            type: requestedType,
                            dbUrl: dbUrl ?? undefined,
                        },
                        { checkHash: false }
                    ),
                    {
                        ...validationContext,
                        source: 'system.identify',
                    }
                );
            }

            if (!metadata) {
                continue;
            }

            planned.push({ item, metadata });
        }

        const createdVideos: CreatedVideo[] = [];
        const startItems: VideoProcessorStartItem[] = [];

        try {
            for (const plan of planned) {
                const video = await videoService.initiateUpload(plan.metadata, {
                    accountId: account.id,
                    status: processor.initialStatus ?? 'processing',
                });

                createdVideos.push(video);
                startItems.push({
                    id: plan.item.id,
                    videoId: video.id,
                    metadata: plan.metadata,
                    source: plan.item.source,
                });
            }
        } catch (e) {
            const createdVideoIds = createdVideos.map((v) => v.id);
            if (createdVideoIds.length > 0) await db.update(videos).set({ status: 'error' }).where(inArray(videos.id, createdVideoIds));
            throw e;
        }

        if (createdVideos.length === 0)
            throw new AppError('Failed to retrieve metadata. Please provide valid video data or db url', {
                statusCode: 400,
            });

        const videosByItemId = new Map(startItems.map((item, index) => [item.id, { item, video: createdVideos[index] }]));

        processor
            .start(
                { source, items: startItems },
                addonContext(
                    createdVideos.map((v) => v.id),
                    account.id
                )
            )
            .then(async (outputs) => {
                const outputItems = Array.isArray(outputs) ? outputs : [outputs];
                const returnedItemIds = new Set<string>();

                await Promise.allSettled(
                    outputItems.map(async ({ id, fileName, fileSize, path }) => {
                        const plannedVideo = videosByItemId.get(id);
                        if (!plannedVideo?.video) {
                            logger.warn({ id, processor: processor.id }, 'Processor returned an unknown output item');
                            return;
                        }
                        if (returnedItemIds.has(id)) {
                            logger.warn({ id, processor: processor.id }, 'Processor returned same output item id twice');
                            return;
                        }

                        const { item, video } = plannedVideo;
                        returnedItemIds.add(id);
                        await db
                            .update(videos)
                            .set({ status: 'processing' })
                            .where(and(eq(videos.id, video.id), ne(videos.status, 'processing')))
                            .catch(() => logger.error({ videoId: video.id }, 'Failed to update db status to processing'));

                        await processVideoWorkflow({
                            accountId: account.id,
                            videoId: video.id,
                            type: item.metadata.type,
                            imdbId: item.metadata.imdbId,
                            tempPath: path,
                            originalName: fileName,
                            fileSize: fileSize,
                        }).catch((error) => handleWorkflowError(video.id, error, 'video'));
                    })
                );

                const missingOutputItems = startItems
                    .filter((item) => !returnedItemIds.has(item.id))
                    .filter((i) => videosByItemId.has(i.id));
                const missingItemVideoIds = missingOutputItems.map((i) => i.videoId);

                if (missingItemVideoIds.length > 0) {
                    await db
                        .update(videos)
                        .set({ status: 'error' })
                        .where(inArray(videos.id, missingItemVideoIds))
                        .catch(() => logger.error({ videoIds: missingItemVideoIds }, 'Failed to update db status to error'));

                    logger.warn(
                        { videoIds: missingItemVideoIds, processor: processor.id },
                        'Processor did not return output for video item'
                    );
                }
            })
            .catch(async (error) => {
                if (
                    error instanceof DownloadCancelledError ||
                    (error instanceof Error && (error.name == DownloadCancelledError.name || error.message === 'Torrent download canceled'))
                ) {
                    await Promise.all(
                        createdVideos.map((video) => db.update(videos).set({ status: 'error' }).where(eq(videos.id, video.id)))
                    );
                    logger.info({ videoIds: createdVideos.map((video) => video.id), processor: processor.id }, 'Video import canceled');
                    return;
                }

                await Promise.all(createdVideos.map((video) => handleWorkflowError(video.id, error, processor.id)));
            })
            .finally(() =>
                processorRun.cleanup().catch(() => logger.error({ id: processorRun.processor.id }, 'Failed to do processor cleanup'))
            );

        return createdVideos;
    } catch (e) {
        if (savedSourcePath) await fs.unlink(savedSourcePath).catch(() => {});
        await processorRun.cleanup();
        if (e instanceof AppError) throw e;
        throw new AppError('Failed to upload files', { statusCode: 500, cause: e });
    }
};
