import { authGuard } from '@shared/middlewares/auth.middleware';
import Elysia from 'elysia';
import {
    accountNotificationsQuerySchema,
    markAccountNotificationsSchema,
    resetPasswordSchema,
    sessionIdSchema,
    setupTotpSchema,
} from './account.schema';
import { accountService, accountTotpService } from './account.container';
import { clearAuthCookies } from '@shared/utils/cookies';

export const accountRouter = new Elysia({ prefix: '/account' })
    .use(authGuard)
    .guard({ auth: { selectedProfile: false } })
    .get(
        '/@me',
        async ({ user }) => {
            const account = await accountService.getMe(user.id);
            return { status: 'success', data: { account } };
        },
        {
            auth: { verified: false, selectedProfile: false },
            detail: { tags: ['Account'], summary: 'Get account profile' },
        }
    )
    .get(
        '/notifications',
        async ({ user, query }) => {
            const { notifications, meta } = await accountService.getAccountNotifications(user.id, query);
            return { status: 'success', data: { notifications }, meta };
        },
        { query: accountNotificationsQuerySchema, detail: { tags: ['Account'], summary: 'List account notifications' } }
    )
    .patch(
        '/notifications/mark',
        async ({ body, user }) => {
            const { notificationIds } = markAccountNotificationsSchema.parse(body);
            await accountService.markAccountNotifications(user.id, {
                markAll: notificationIds.length === 0,
                notificationIds,
            });
            return { status: 'success' };
        },
        {
            body: markAccountNotificationsSchema,
            detail: { tags: ['Account'], summary: 'Mark account notifications' },
        }
    )
    .delete(
        '/notifications',
        async ({ user, status }) => {
            await accountService.clearAccountNotifications(user.id);
            return status(204);
        },
        { detail: { tags: ['Account'], summary: 'Clear account notifications' } }
    )
    .get(
        '/2fa',
        async ({ user }) => {
            const data = await accountService.getTwoFactorStatus(user.id);
            return { status: 'success', data };
        },
        { detail: { tags: ['Account'], summary: 'Get 2FA status' } }
    )
    .group('/sessions', (app) =>
        app
            .get(
                '/',
                async ({ user }) => {
                    const sessions = await accountService.getSessions({ accountId: user.id, currentSessionId: user.sessionId });
                    return { status: 'success', data: { sessions } };
                },
                {
                    detail: { tags: ['Account'], summary: 'Get all account sessions' },
                }
            )
            .get(
                '/:id',
                async ({ params: { id }, user }) => {
                    const session = await accountService.getSessionById({
                        accountId: user.id,
                        sessionId: id,
                        currentSessionId: user.sessionId,
                    });
                    return { status: 'success', data: { session } };
                },
                {
                    params: sessionIdSchema,
                    stepUp: 'sensitive:write',
                    detail: { tags: ['Account'], summary: 'Get session by ID' },
                }
            )
            .delete(
                '/:id',
                async ({ params: { id }, user, status }) => {
                    await accountService.revokeSessionById({ accountId: user.id, sessionId: id, currentSessionId: user.sessionId });
                    return status(204);
                },
                {
                    params: sessionIdSchema,
                    stepUp: 'sensitive:write',
                    detail: { tags: ['Account'], summary: 'Revoke session by ID' },
                }
            )
    )
    .guard({ stepUp: 'sensitive:write' })
    .delete(
        '/',
        async ({ user, cookie }) => {
            await accountService.deleteAccount(user.id);

            clearAuthCookies(cookie);

            return { status: 'success' };
        },
        { detail: { tags: ['Account'], summary: 'Delete account' } }
    )
    .patch(
        '/password',
        async ({ body, user }) => {
            await accountService.resetPassword({ accountId: user.id, password: body.password, sessionId: user.sessionId });
            return { status: 'success' };
        },
        { body: resetPasswordSchema, detail: { tags: ['Account'], summary: 'Change Password' } }
    )
    .group('/authenticator', (app) =>
        app
            .get(
                '/setup',
                async ({ user }) => {
                    const data = await accountTotpService.getTotpSetup(user.id);
                    return { status: 'success', data };
                },
                { detail: { tags: ['Account'], summary: 'Get TOTP Setup QR' } }
            )
            .delete(
                '/setup',
                async ({ user, status }) => {
                    await accountTotpService.cancelTotpSetup(user.id);
                    return status(204, { status: 'success' });
                },
                { detail: { tags: ['Account'], summary: 'Cancel TOTP setup' } }
            )
            .post(
                '/setup',
                async ({ body, user }) => {
                    const data = await accountTotpService.activateTotp(user.id, body.code);
                    return { status: 'success', data };
                },
                { body: setupTotpSchema, detail: { tags: ['Account'], summary: 'Activate TOTP' } }
            )
            .delete(
                '/',
                async ({ user }) => {
                    await accountTotpService.deactivateTotp(user.id);
                    return { status: 'success' };
                },
                { detail: { tags: ['Account'], summary: 'Disable TOTP' } }
            )
    );
