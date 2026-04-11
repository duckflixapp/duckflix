import { Elysia } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import * as UserService from './user.service';
import { validateMarkUserNotifications } from './user.validator';
import { createRateLimit } from '@shared/configs/ratelimit';

export const usersRouter = new Elysia({ prefix: '/users' })
    .use(authGuard)
    .guard({ auth: true })
    .use(createRateLimit({ max: 30, duration: 3000 }))
    .get(
        '/@me',
        async ({ user }) => {
            const data = await UserService.getMe(user.id);
            return { status: 'success', data: { user: data } };
        },
        {
            detail: { tags: ['User'], summary: 'Profile' },
            auth: { verified: false },
        }
    )
    .get(
        '/@me/notifications',
        async ({ user }) => {
            const notifications = await UserService.getUserNotifications(user.id);
            return { status: 'success', data: { notifications } };
        },
        {
            detail: { tags: ['User'], summary: 'List Notifications' },
        }
    )
    .patch(
        '/@me/notifications/mark',
        async ({ body, user }) => {
            const { notificationIds } = validateMarkUserNotifications.parse(body);
            await UserService.markUserNotifications(user.id, {
                markAll: notificationIds.length === 0,
                notificationIds,
            });
            return { status: 'success' };
        },
        {
            body: validateMarkUserNotifications,
            detail: { tags: ['User'], summary: 'Mark' },
        }
    )
    .delete(
        '/@me/notifications',
        async ({ user, set }) => {
            await UserService.clearUserNotifications(user.id);
            set.status = 204;
        },
        {
            detail: { tags: ['User'], summary: 'Remove' },
        }
    );
