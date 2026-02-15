import type { Request, Response } from 'express';
import * as UserService from './user.service';
import { catchAsync } from '../../shared/utils/catchAsync';

export const getMe = catchAsync(async (req: Request, res: Response) => {
    if (!req.userId) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await UserService.getMe(req.userId);

    return res.status(200).json({
        status: 'success',
        data: { user },
    });
});

export const getUserNotifications = catchAsync(async (req: Request, res: Response) => {
    const notifications = await UserService.getUserNotifications(req.userId!);

    res.status(201).json({
        status: 'success',
        data: { notifications },
    });
});
