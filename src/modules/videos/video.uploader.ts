import { AppError } from '@shared/errors';
import { videoProcessorRegistry } from './imports/video-processor.registry';
import type { CreateVideoInput } from './video.validator';
import type { VideoProcessorContext } from './imports';
import { downloadRegistry } from './workflows/download.registry';
import { logger } from '@shared/configs/logger';
import { notifyJobStatus } from '@shared/services/notifications/notification.helper';
import { emitVideoProgress, handleWorkflowError } from './video.handler';
import { enrichMetadata, resolveMetadata } from '@shared/services/metadata/metadata.service';
import { videoService } from './videos.container';
import { saveUploadToTemp } from './upload-temp-file';
import type { VideoMetadata, VideoProcessorScanItem, VideoProcessorStartItem } from '@duckflixapp/addon-sdk/types';
import { identifyVideoWorkflow } from './workflows/identify.workflow';
import { processVideoWorkflow } from './workflows/video.workflow';
import { db } from '@shared/configs/db';
import { videos } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { DownloadCancelledError } from './imports/video-processor.ports';
import fs from 'node:fs/promises';
import type { VideoMinDTO } from '@duckflixapp/shared';

type CreatedVideo = Awaited<ReturnType<typeof videoService.initiateUpload>>;
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
    let cleanupSourceOnError = true;

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

        // logger.debug({ scanItems }, 'Found items');

        const planned: Array<{ item: VideoProcessorScanItem; metadata: VideoMetadata }> = [];

        for (const item of scanItems) {
            const requestedType = item.requestedType ?? type;
            const metadataFromUrl = scanItems.length === 1 && requestedType === type ? await enrichMetadata(dbUrl, context) : null;

            let metadata =
                item.metadata ??
                metadataFromUrl ??
                (await processor.identify({ source: item.source, requestedType, dbUrl: dbUrl ?? undefined }, preflightContext));

            // fallback to default identification
            if (!metadata && item.source.sourceType === 'file')
                metadata = await identifyVideoWorkflow(
                    {
                        fileName: item.title,
                        filePath: item.source.tempPath,
                        type: requestedType,
                        dbUrl: dbUrl ?? undefined,
                    },
                    { checkHash: false }
                );

            if (!metadata) {
                continue;
            }

            planned.push({ item, metadata });
        }

        const createdVideos: CreatedVideo[] = [];
        const startItems: VideoProcessorStartItem[] = [];

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

        if (createdVideos.length === 0)
            throw new AppError('Failed to retrieve metadata. Please provide valid video data or db url', {
                statusCode: 400,
            });

        logger.debug({ planned: planned.map((p) => p.item.title) }, 'Started upload...');
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

                await Promise.allSettled(
                    outputItems.map(async ({ id, fileName, fileSize, path }) => {
                        const plannedVideo = videosByItemId.get(id);
                        if (!plannedVideo?.video) {
                            logger.warn({ id, processor: processor.id }, 'Processor returned an unknown output item');
                            return;
                        }

                        const { item, video } = plannedVideo;
                        await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, video.id));

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
            .finally(() => processorRun.cleanup());

        return createdVideos;
    } catch (e) {
        if (savedSourcePath && cleanupSourceOnError) await fs.unlink(savedSourcePath).catch(() => {});
        await processorRun.cleanup();
        throw e;
    }
};
