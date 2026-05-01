import { Elysia } from 'elysia';
import { authRouter } from '@modules/auth';
import { usersRouter } from '@modules/users';
import { adminRouter } from '@modules/admin';
import { libraryRouter } from '@modules/library';
import { searchRouter } from '@modules/search';
import { videoRouter } from '@modules/videos';
import { moviesRouter } from '@modules/movies';
import { seriesRouter } from '@modules/series';
import { healthRouter } from './health';
import { tasksRouter } from '@modules/tasks';
import { mediaRouter } from '@modules/media';
import { accountRouter } from '@modules/account';
import { profilesRouter } from '@modules/profiles';

export const v1 = new Elysia({ prefix: '/v1' })
    .use(healthRouter)
    .use(authRouter)
    .use(usersRouter)
    .use(accountRouter)
    .use(profilesRouter)
    .use(adminRouter)
    .use(libraryRouter)
    .use(searchRouter)
    .use(videoRouter)
    .use(moviesRouter)
    .use(seriesRouter)
    .use(tasksRouter)
    .use(mediaRouter);
