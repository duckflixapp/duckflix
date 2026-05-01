import { Elysia, t } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { setAuthTokenCookie } from '@shared/utils/cookies';
import { createRateLimit } from '@shared/configs/ratelimit';
import { getAccountProfiles, selectProfile } from './profile.service';
import { profileParamsSchema } from './profile.validator';

const cookieSchema = t.Cookie({
    auth_token: t.Optional(t.String()),
});

export const profilesRouter = new Elysia({ prefix: '/profiles' })
    .use(authGuard)
    .use(createRateLimit({ max: 30, duration: 3000 }))
    .guard({ auth: { selectedProfile: false }, cookie: cookieSchema })
    .get(
        '/',
        async ({ user }) => {
            const profiles = await getAccountProfiles(user.id);
            return { status: 'success', data: { profiles } };
        },
        { detail: { tags: ['Profiles'], summary: 'List Profiles' } }
    )
    .post(
        '/:id/select',
        async ({ params: { id }, user, cookie }) => {
            const result = await selectProfile({
                accountId: user.id,
                sessionId: user.sessionId,
                profileId: id,
            });

            setAuthTokenCookie(cookie, result.token);

            return { status: 'success', data: result };
        },
        { params: profileParamsSchema, detail: { tags: ['Profiles'], summary: 'Select Profile' } }
    );
