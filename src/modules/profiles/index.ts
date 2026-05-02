import { Elysia, t } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { setAuthTokenCookie } from '@shared/utils/cookies';
import { createRateLimit } from '@shared/configs/ratelimit';
import { getAccountProfiles, getProfileById, removeProfile, selectProfile } from './profile.service';
import { profileParamsSchema } from './profile.validator';

const cookieSchema = t.Cookie({
    auth_token: t.Optional(t.String()),
});

export const profilesRouter = new Elysia({ prefix: '/profiles' })
    .use(authGuard)
    .use(createRateLimit({ max: 30, duration: 3000 }))
    .get(
        '/@me',
        async ({ user }) => {
            const profile = await getProfileById({ accountId: user.id, profileId: user.profileId! });
            return { status: 'success', data: { profile } };
        },
        {
            auth: { selectedProfile: true },
            detail: { tags: ['Profiles'], summary: 'Get selected profile' },
        }
    )
    .post(
        '/logout',
        async ({ user, cookie }) => {
            const result = await removeProfile({ accountId: user.id, sessionId: user.sessionId });

            setAuthTokenCookie(cookie, result.token);

            return { status: 'success', data: result };
        },
        {
            cookie: cookieSchema,
            auth: { selectedProfile: true },
            detail: { tags: ['Profiles'], summary: 'Get selected profile' },
        }
    )
    .get(
        '/',
        async ({ user }) => {
            const profiles = await getAccountProfiles(user.id);
            return { status: 'success', data: { profiles } };
        },
        {
            auth: { selectedProfile: false },
            detail: { tags: ['Profiles'], summary: 'List Profiles' },
        }
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
        {
            auth: { selectedProfile: false },
            cookie: cookieSchema,
            params: profileParamsSchema,
            detail: { tags: ['Profiles'], summary: 'Select Profile' },
        }
    );
