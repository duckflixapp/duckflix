import { Elysia } from 'elysia';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { createRateLimit } from '@shared/configs/ratelimit';
import { killTaskSchema } from './tasks.validator';
import * as TaskService from './tasks.service';

const killTaskLimiter = createRateLimit({
    max: 5,
    duration: 10000,
});

export const tasksRouter = new Elysia({ prefix: '/tasks', detail: { tags: ['Tasks'] } })
    .use(authGuard)
    .guard({ auth: 'contributor' })
    .use(killTaskLimiter)

    .delete(
        '/videoVersion/:id/kill',
        async ({ params: { id }, set }) => {
            const { id: validatedId } = killTaskSchema.parse({ id });

            const { wasInQueue, wasRunning } = await TaskService.killMovieTask(validatedId);

            if (!wasInQueue && !wasRunning) {
                set.status = 404;
                return {
                    status: 'error',
                    message: 'Task could not be found or is not currently active.',
                };
            }

            return {
                status: 'success',
                message: wasInQueue ? 'Task successfully removed from the waiting queue.' : 'Active video processing was terminated.',
                details: { wasInQueue, wasRunning },
            };
        },
        {
            params: killTaskSchema,
            detail: {
                tags: ['Tasks'],
                summary: 'Terminate',
            },
        }
    );
