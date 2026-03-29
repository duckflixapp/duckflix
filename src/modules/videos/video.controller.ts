import type { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { createVideoSchema, videoParamsSchema } from './video.validator';
import { AppError } from '../../shared/errors';
import { identifyVideoWorkflow } from './workflows/identify.workflow';
import * as VideoService from './video.service';
import { processVideoWorkflow } from './workflows/video.workflow';
import { processTorrentFileWorkflow } from './workflows/torrent.workflow';
import { handleWorkflowError } from './video.handler';
import * as MetadataService from '../../shared/services/metadata/metadata.service';

export const upload = catchAsync(async (req: Request, res: Response) => {
    const data = createVideoSchema.parse(req.body);
    const type = data.type;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const videoFile = files?.['video']?.[0];
    const torrentFile = files?.['torrent']?.[0];
    if (!videoFile && !torrentFile) throw new AppError('Please provide either a valid video or torrent file', { statusCode: 400 });

    const metadataEnrich = MetadataService.metadataEnrichers[type];
    let metadata = await metadataEnrich(data.dbUrl, data);

    if (!metadata && videoFile)
        metadata = await identifyVideoWorkflow({ filePath: videoFile.path, fileName: videoFile.originalname, type });
    if (!metadata && torrentFile)
        metadata = await identifyVideoWorkflow(
            { filePath: torrentFile.path, fileName: torrentFile.originalname, type },
            { checkHash: false }
        );
    if (!metadata)
        throw new AppError('Failed to retrieve metadata. Please provide valid movie data or db url', {
            statusCode: 400,
        });

    const video = await VideoService.initiateUpload(metadata, {
        userId: req.user!.id,
        status: videoFile ? 'processing' : 'downloading',
    });

    if (videoFile)
        processVideoWorkflow({
            userId: req.user!.id,
            videoId: video.id,
            type: metadata.type,
            imdbId: metadata.imdbId,
            tempPath: videoFile.path,
            originalName: videoFile.originalname,
            fileSize: videoFile.size,
        }).catch((e) => handleWorkflowError(video.id, e, 'video'));
    else if (torrentFile?.path) {
        processTorrentFileWorkflow({
            userId: req.user!.id,
            videoId: video.id,
            type: metadata.type,
            imdbId: metadata.imdbId,
            torrentPath: torrentFile?.path,
        }).catch((e) => handleWorkflowError(video.id, e, 'torrent'));
    } else throw new Error('Please provide valid video file or torrent');

    res.status(201).json({
        status: 'success',
        message: torrentFile ? 'Torrent download initiated.' : 'Video processing started.',
        data: { video },
    });
});

export const getVideo = catchAsync(async (req: Request, res: Response) => {
    const { id } = videoParamsSchema.parse(req.params);

    const video = await VideoService.getVideoById(id);

    res.status(200).json({ status: 'success', data: { video } });
});

export const resolveVideo = catchAsync(async (req: Request, res: Response) => {
    const { id } = videoParamsSchema.parse(req.params);

    const content = await VideoService.resolveVideo(id);

    res.status(200).json({ status: 'success', data: { content } });
});
