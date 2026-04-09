import { Elysia } from 'elysia';
// import { authPlugin, rolePlugin } from '@shared/middlewares/auth.middleware';
import { authRouter } from '@modules/auth';
import { usersRouter } from '@modules/users';
import { adminRouter } from '@modules/admin';
import { libraryRouter } from '@modules/library';
import { searchRouter } from '@modules/search';
import { videoRouter } from '../modules/videos';
// import movieRouter from '../modules/movies/movies.router';
// import seriesRouter from '../modules/series/router';
// import mediaRouter from '../modules/media/media.router';
// import adminRouter from '../modules/admin/admin.router';
// import tasksRouter from '../modules/tasks/tasks.router';
import { healthRouter } from './health';

export const v1 = new Elysia({ prefix: '/v1' })
    .use(healthRouter)
    .use(authRouter)
    .use(usersRouter)
    .use(adminRouter)
    .use(libraryRouter)
    .use(searchRouter)
    .use(videoRouter);
// .use(new Elysia().use(authPlugin()).use(movieRouter))
// .use(new Elysia().use(authPlugin()).use(seriesRouter))
// .use(mediaRouter)
// .use(new Elysia().use(rolePlugin('contributor')).use(tasksRouter));
