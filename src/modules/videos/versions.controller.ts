import type { Request, Response } from 'express';
import * as VersionService from './services/versions.service';
import { catchAsync } from '@utils/catchAsync';
import { addVersionSchema, videoParamsSchema, videoVersionParamsSchema } from './video.validator';

export const getMany = catchAsync(async (req: Request, res: Response) => {
    const { id } = videoParamsSchema.parse(req.params);

    const versions = await VersionService.getAllVideoVersions(id);

    res.status(200).json({ status: 'success', data: { versions } });
});

export const addVersion = catchAsync(async (req: Request, res: Response) => {
    const { id } = videoParamsSchema.parse(req.params);
    const { height } = addVersionSchema.parse(req.body);

    await VersionService.addVideoVersion(id, height);

    res.status(201).json({ status: 'success' });
});

export const deleteVersion = catchAsync(async (req: Request, res: Response) => {
    const { id, versionId } = videoVersionParamsSchema.parse(req.params);

    await VersionService.deleteVideoVersion(id, versionId);

    res.status(204).json({ status: 'success' });
});
