import type { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { killTaskSchema } from './tasks.validator';
import * as TaskService from './tasks.service';

export const killMovieTask = catchAsync(async (req: Request, res: Response) => {
    const { id } = killTaskSchema.parse(req.params);

    const { wasInQueue, wasRunning } = await TaskService.killMovieTask(id);

    if (!wasInQueue && !wasRunning) {
        return res.status(404).json({
            status: 'error',
            message: 'Task could not be found or is not currently active.',
        });
    }

    res.status(200).json({
        status: 'success',
        message: wasInQueue ? 'Task successfully removed from the waiting queue.' : 'Active movie processing was terminated.',
        details: { wasInQueue, wasRunning },
    });
});
