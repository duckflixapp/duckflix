import { authGuard } from '@shared/middlewares/auth.middleware';
import Elysia from 'elysia';
import { resetPasswordSchema, sessionIdSchema, setupTotpSchema } from './account.schema';
import { deleteAccount, getSessionById, getSessions, getTwoFactorStatus, resetPassword, revokeSessionById } from './account.service';
import { activateTotp, cancelTotpSetup, deactivateTotp, getTotpSetup } from './totp.service';
import { env } from '@core/env';

const apiBasePath = new URL(env.BASE_URL).pathname.replace(/\/$/, '');
const authCookiePath = `${apiBasePath}/auth`;

export const accountRouter = new Elysia({ prefix: '/account' })
    .use(authGuard)
    .guard({ auth: true })
    .get(
        '/2fa',
        async ({ user }) => {
            const data = await getTwoFactorStatus(user.id);
            return { status: 'success', data };
        },
        { detail: { tags: ['Account'], summary: 'Get 2FA status' } }
    )
    .group('/sessions', (app) =>
        app
            .get(
                '/',
                async ({ user }) => {
                    const sessions = await getSessions({ userId: user.id, currentSessionId: user.sessionId });
                    return { status: 'success', data: { sessions } };
                },
                {
                    detail: { tags: ['Account'], summary: 'Get all account sessions' },
                }
            )
            .get(
                '/:id',
                async ({ params: { id }, user }) => {
                    const session = await getSessionById({ userId: user.id, sessionId: id, currentSessionId: user.sessionId });
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
                    await revokeSessionById({ userId: user.id, sessionId: id, currentSessionId: user.sessionId });
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
            await deleteAccount(user.id);

            cookie.auth_token!.remove();
            cookie.csrf_token!.remove();
            cookie.refresh_token!.path = authCookiePath;
            cookie.refresh_token!.remove();

            return { status: 'success' };
        },
        { detail: { tags: ['Account'], summary: 'Delete account' } }
    )
    .patch(
        '/password',
        async ({ body, user }) => {
            await resetPassword({ userId: user.id, password: body.password, sessionId: user.sessionId });
            return { status: 'success' };
        },
        { body: resetPasswordSchema, detail: { tags: ['Account'], summary: 'Change Password' } }
    )
    .group('/authenticator', (app) =>
        app
            .get(
                '/setup',
                async ({ user }) => {
                    const data = await getTotpSetup(user.id);
                    return { status: 'success', data };
                },
                { detail: { tags: ['Account'], summary: 'Get TOTP Setup QR' } }
            )
            .delete(
                '/setup',
                async ({ user, status }) => {
                    await cancelTotpSetup(user.id);
                    return status(204, { status: 'success' });
                },
                { detail: { tags: ['Account'], summary: 'Cancel TOTP setup' } }
            )
            .post(
                '/setup',
                async ({ body, user }) => {
                    const data = await activateTotp(user.id, body.code);
                    return { status: 'success', data };
                },
                { body: setupTotpSchema, detail: { tags: ['Account'], summary: 'Activate TOTP' } }
            )
            .delete(
                '/',
                async ({ user }) => {
                    await deactivateTotp(user.id);
                    return { status: 'success' };
                },
                { detail: { tags: ['Account'], summary: 'Disable TOTP' } }
            )
    );
