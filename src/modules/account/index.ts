import { authGuard } from '@shared/middlewares/auth.middleware';
import Elysia from 'elysia';
import { resetPasswordSchema } from './account.schema';
import { resetPassword } from './account.service';

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
    );
