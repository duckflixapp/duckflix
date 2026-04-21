import { Elysia } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { toSystemDTO } from '@shared/mappers/system.mapper';
import { changeUserRoleSchema, systemSettingsUpdateSchema, userSchema } from './admin.validator';
import * as AdminService from './admin.service';
import { createRateLimit } from '@shared/configs/ratelimit';
import { systemSettings } from '@shared/services/system.service';

export const adminRouter = new Elysia({ prefix: '/admin' })
    .use(authGuard)
    .guard({ auth: 'admin' })
    .use(createRateLimit({ max: 50, duration: 3000 }))
    .get(
        '/system',
        async () => {
            const system = await systemSettings.get();
            return { status: 'success', data: { system: toSystemDTO(system) } };
        },
        { detail: { tags: ['Admin'], summary: 'Details' } }
    )
    .patch(
        '/system',
        async ({ body, user }) => {
            if (body?.external?.tmdb?.apiKey?.includes('**********')) delete body.external.tmdb.apiKey;
            if (body?.external?.openSubtitles?.apiKey?.includes('**********')) delete body.external.openSubtitles.apiKey;
            if (body?.external?.openSubtitles?.password?.includes('**********')) delete body.external.openSubtitles.password;
            if (body?.external?.email?.smtpSettings?.password?.includes('**********')) delete body.external.email.smtpSettings.password;

            const system = await AdminService.updateSystemSettings(body, { userId: user.id });
            return { status: 'success', data: { system: toSystemDTO(system) } };
        },
        { body: systemSettingsUpdateSchema, detail: { tags: ['Admin'], summary: 'Update' } }
    )
    .get(
        '/users',
        async () => {
            const users = await AdminService.getUsersWithRoles();
            return { status: 'success', data: { users } };
        },
        { detail: { tags: ['Admin'], summary: 'List Users' } }
    )
    .patch(
        '/users',
        async ({ body, user }) => {
            await AdminService.changeUserRole(body.email, body.role, { userId: user.id });
            return new Response(null, { status: 204 });
        },
        { body: changeUserRoleSchema, detail: { tags: ['Admin'], summary: 'Update Roles' } }
    )
    .delete(
        '/users',
        async ({ body, user }) => {
            await AdminService.deleteUser(body.email, { userId: user.id });
            return new Response(null, { status: 204 });
        },
        { body: userSchema, detail: { tags: ['Admin'], summary: 'Remove User' } }
    )
    .get(
        '/stats',
        async () => {
            const statistics = await AdminService.getSystemStatistics();
            return { status: 'success', data: { statistics } };
        },
        { detail: { tags: ['Admin'], summary: 'Statistics' } }
    );
