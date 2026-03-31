import type { Request, Response } from 'express';
import { catchAsync } from '@utils/catchAsync';
import { seriesParamSchema } from './validator';
import { deleteSeriesById, getSeriesById } from './services/series.service';

export const getOne = catchAsync(async (req: Request, res: Response) => {
    const { seriesId } = seriesParamSchema.parse(req.params);

    const series = await getSeriesById(seriesId);

    res.status(200).json({
        status: 'success',
        data: { series },
    });
});

export const deleteOne = catchAsync(async (req: Request, res: Response) => {
    const { seriesId } = seriesParamSchema.parse(req.params);
    const userId = req.user!.id;

    await deleteSeriesById({ seriesId, userId });

    res.status(204).json({
        status: 'success',
    });
});
