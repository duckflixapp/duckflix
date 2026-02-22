import type { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { systemSettings } from '../../shared/services/system.service';
import { toSystemDTO } from '../../shared/mappers/system.mapper';
import { changeUserRoleSchema, systemSettingsUpdateSchema } from './admin.validator';
import * as AdminService from './admin.service';

export const getSystem = catchAsync(async (req: Request, res: Response) => {
    const system = await systemSettings.get();

    res.status(200).json({
        status: 'success',
        data: { system: toSystemDTO(system) },
    });
});

export const updateSystem = catchAsync(async (req: Request, res: Response) => {
    const validatedData = systemSettingsUpdateSchema.parse(req.body);

    if (validatedData?.external?.tmdb?.apiKey?.includes('**********')) delete validatedData.external.tmdb.apiKey;
    if (validatedData?.external?.openSubtitles?.apiKey?.includes('**********')) delete validatedData.external.openSubtitles.apiKey;
    if (validatedData?.external?.openSubtitles?.password?.includes('**********')) delete validatedData.external.openSubtitles.password;
    if (validatedData?.external?.email?.smtpSettings?.password?.includes('**********'))
        delete validatedData.external.email.smtpSettings.password;

    const system = await systemSettings.update(validatedData);

    res.status(200).json({
        status: 'success',
        data: { system: toSystemDTO(system) },
    });
});

export const getUsersWithRole = catchAsync(async (req: Request, res: Response) => {
    const users = await AdminService.getUsersWithRoles();

    res.status(200).json({
        status: 'success',
        data: { users },
    });
});

export const changeUserRole = catchAsync(async (req: Request, res: Response) => {
    const user = req.user!;
    const data = changeUserRoleSchema.parse(req.body);

    await AdminService.changeUserRole(data.email, data.role, { user: user.id });

    res.status(204).json({
        status: 'success',
    });
});
