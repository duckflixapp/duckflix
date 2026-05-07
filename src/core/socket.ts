import { errorPlugin } from '@shared/errors';
import { socketAuthPlugin } from '../shared/middlewares/auth.middleware';
import { Elysia, t } from 'elysia';

export const socketPlugin = new Elysia()
    .use(errorPlugin)
    .use(socketAuthPlugin)
    .ws('/ws', {
        async open(ws) {
            const accountId = ws.data.user.id;

            if (!accountId) {
                ws.close();
                return;
            }

            ws.subscribe(`user:${accountId}`);
        },
        message(ws, { event, data }) {
            switch (event) {
                case 'video:join':
                    if (data) ws.subscribe(`video:${data}`);
                    break;

                case 'video:leave':
                    if (data) ws.unsubscribe(`video:${data}`);
                    break;
            }
        },
        body: t.Object({
            event: t.Union([t.Literal('video:join'), t.Literal('video:leave')]),
            data: t.Optional(t.String()),
        }),
    });
