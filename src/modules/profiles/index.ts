import { Elysia, t } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { setAuthTokenCookie } from '@shared/utils/cookies';
import { createRateLimit } from '@shared/configs/ratelimit';
import {
    clearSelectedProfile,
    createProfile,
    deleteProfile,
    getAccountProfiles,
    getProfileAvatars,
    getProfileById,
    removeProfilePin,
    selectProfile,
    updateProfileAvatar,
    updateProfilePin,
} from './profile.service';
import {
    createProfileSchema,
    deleteProfileSchema,
    profileParamsSchema,
    removeProfilePinSchema,
    selectProfileSchema,
    updateProfileAvatarSchema,
    updateProfilePinSchema,
} from './profile.validator';

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
            auth: { verified: false, selectedProfile: true },
            detail: { tags: ['Profiles'], summary: 'Get selected profile' },
        }
    )
    .post(
        '/logout',
        async ({ user, cookie }) => {
            const result = await clearSelectedProfile({ accountId: user.id, sessionId: user.sessionId });

            setAuthTokenCookie(cookie, result.token);

            return { status: 'success', data: result };
        },
        {
            cookie: cookieSchema,
            auth: { verified: false, selectedProfile: true },
            detail: { tags: ['Profiles'], summary: 'Logout from profile' },
        }
    )
    .delete(
        '/@me',
        async ({ body, user, cookie }) => {
            const result = await deleteProfile({
                accountId: user.id,
                sessionId: user.sessionId,
                profileId: user.profileId!,
                pin: body?.pin,
            });

            setAuthTokenCookie(cookie, result.token);

            return { status: 'success', data: result };
        },
        {
            body: deleteProfileSchema,
            cookie: cookieSchema,
            auth: { verified: false, selectedProfile: true },
            detail: { tags: ['Profiles'], summary: 'Delete selected profile' },
        }
    )
    .patch(
        '/@me/avatar',
        async ({ body, user }) => {
            const profile = await updateProfileAvatar({
                accountId: user.id,
                profileId: user.profileId!,
                avatarAssetId: body.avatarAssetId,
            });

            return { status: 'success', data: { profile } };
        },
        {
            body: updateProfileAvatarSchema,
            auth: { verified: false, selectedProfile: true },
            detail: { tags: ['Profiles'], summary: 'Update selected profile avatar' },
        }
    )
    .patch(
        '/@me/pin',
        async ({ body, user }) => {
            const profile = await updateProfilePin({
                accountId: user.id,
                profileId: user.profileId!,
                pin: body.pin,
                currentPin: body.currentPin,
            });

            return { status: 'success', data: { profile } };
        },
        {
            body: updateProfilePinSchema,
            auth: { verified: false, selectedProfile: true },
            detail: { tags: ['Profiles'], summary: 'Set selected profile PIN' },
        }
    )
    .delete(
        '/@me/pin',
        async ({ body, user }) => {
            const profile = await removeProfilePin({
                accountId: user.id,
                profileId: user.profileId!,
                pin: body.pin,
            });

            return { status: 'success', data: { profile } };
        },
        {
            body: removeProfilePinSchema,
            auth: { verified: false, selectedProfile: true },
            detail: { tags: ['Profiles'], summary: 'Remove selected profile PIN' },
        }
    )
    .post(
        '/',
        async ({ body, user, cookie, set }) => {
            const result = await createProfile({
                accountId: user.id,
                sessionId: user.sessionId,
                name: body.name,
                avatarAssetId: body.avatarAssetId,
                pin: body.pin,
            });

            setAuthTokenCookie(cookie, result.token);
            set.status = 201;

            return { status: 'success', data: result };
        },
        {
            auth: { verified: false, selectedProfile: false },
            cookie: cookieSchema,
            body: createProfileSchema,
            detail: { tags: ['Profiles'], summary: 'Create Profile' },
        }
    )
    .get(
        '/avatars',
        async () => {
            const avatars = await getProfileAvatars();
            return { status: 'success', data: { avatars } };
        },
        {
            auth: { verified: false, selectedProfile: false },
            detail: { tags: ['Profiles'], summary: 'List profile avatars' },
        }
    )
    .get(
        '/',
        async ({ user }) => {
            const profiles = await getAccountProfiles(user.id);
            return { status: 'success', data: { profiles } };
        },
        {
            auth: { verified: false, selectedProfile: false },
            detail: { tags: ['Profiles'], summary: 'List Profiles' },
        }
    )
    .post(
        '/:id/select',
        async ({ body, params: { id }, user, cookie }) => {
            const result = await selectProfile({
                accountId: user.id,
                sessionId: user.sessionId,
                profileId: id,
                pin: body?.pin,
            });

            setAuthTokenCookie(cookie, result.token);

            return { status: 'success', data: result };
        },
        {
            auth: { verified: false, selectedProfile: false },
            cookie: cookieSchema,
            body: selectProfileSchema,
            params: profileParamsSchema,
            detail: { tags: ['Profiles'], summary: 'Select Profile' },
        }
    );
