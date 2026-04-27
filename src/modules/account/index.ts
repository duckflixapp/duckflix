import { authGuard } from '@shared/middlewares/auth.middleware';
import Elysia from 'elysia';
import { resetPasswordSchema, setupTotpSchema } from './account.schema';
import { activateTotp, cancelTotpSetup, deactivateTotp, getTotpSetup, resetPassword } from './account.service';

export const accountRouter = new Elysia({ prefix: '/account' })
    .use(authGuard)
    .guard({ auth: true })
    .guard({ stepUp: 'sensitive:write' })
    .patch(
        '/password',
        async ({ body, user }) => {
            await resetPassword({ userId: user.id, password: body.password });
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
