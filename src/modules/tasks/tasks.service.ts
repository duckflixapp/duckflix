import { eq } from 'drizzle-orm';
import { db } from '../../shared/configs/db';
import { movieVersions } from '../../shared/schema';
import { taskRegistry } from '../../shared/utils/taskRegistry';
import { TaskNotFoundError } from './tasks.errors';
import { taskHandler } from '../../shared/utils/tasks';

export const killMovieTask = async (id: string) => {
    const task = await db.query.movieVersions.findFirst({
        where: eq(movieVersions.id, id),
    });

    if (!task) throw new TaskNotFoundError();

    const wasInQueue = taskHandler.cancel(id);
    const wasRunning = await taskRegistry.kill(task.id);

    if (wasInQueue || wasRunning) await db.update(movieVersions).set({ status: 'canceled' }).where(eq(movieVersions.id, id));

    return { wasInQueue, wasRunning };
};
