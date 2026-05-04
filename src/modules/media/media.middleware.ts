import { Elysia, type Context } from 'elysia';
import { sessionClient } from './session/session.client';
import { AppError } from '@shared/errors';
import type { MediaSessionClient } from './media.ports';

export const createSessionPlugin = (sessionClient: MediaSessionClient) =>
    new Elysia({ name: 'session-plugin' }).derive({ as: 'global' }, ({ query }) => ({
        resolveMedia: async (videoId: string | undefined) => {
            const session = query.session as string | undefined;

            if (!session || !videoId) {
                throw new AppError('Missing session token or resource ID', { statusCode: 400 });
            }

            return await sessionClient.validate(session, videoId);
        },
    }));

export const createSessionGuard = (sessionClient: MediaSessionClient) =>
    new Elysia({ name: 'session-guard' }).use(createSessionPlugin(sessionClient)).macro({
        mediaSession: (getVideoId: (context: Context) => undefined | string | Promise<string>) => ({
            async resolve({ resolveMedia, ...context }) {
                const videoId = await getVideoId(context);

                const mediaSession = await resolveMedia(videoId);
                return { mediaSession };
            },
        }),
    });

export const sessionPlugin = createSessionPlugin(sessionClient);
export const sessionGuard = createSessionGuard(sessionClient);
