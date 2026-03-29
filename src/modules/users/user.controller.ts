import type { Request, Response } from 'express';
import * as UserService from './user.service';
import { catchAsync } from '@utils/catchAsync';
import { validateMarkUserNotifications } from './user.validator';

export const getMe = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await UserService.getMe(req.user.id);

    return res.status(200).json({
        status: 'success',
        data: { user },
    });
});

export const getUserNotifications = catchAsync(async (req: Request, res: Response) => {
    const notifications = await UserService.getUserNotifications(req.user!.id);

    res.status(200).json({
        status: 'success',
        data: { notifications },
    });
});

export const markUserNotifications = catchAsync(async (req: Request, res: Response) => {
    const { notificationIds } = validateMarkUserNotifications.parse(req.body);

    await UserService.markUserNotifications(req.user!.id, {
        markAll: notificationIds.length === 0,
        notificationIds,
    });

    res.status(200).json({
        status: 'success',
    });
});

export const clearUserNotifications = catchAsync(async (req: Request, res: Response) => {
    await UserService.clearUserNotifications(req.user!.id);

    res.status(204).json({
        status: 'success',
    });
});
