import { eq } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { videoVersions } from '@schema/video.schema';
import { taskRegistry } from '@utils/taskRegistry';
import { TaskNotFoundError } from './tasks.errors';
import { taskHandler } from '@utils/taskHandler';

export const killMovieTask = async (id: string) => {
    const task = await db.query.videoVersions.findFirst({
        where: eq(videoVersions.id, id),
    });

    if (!task) throw new TaskNotFoundError();

    const wasInQueue = taskHandler.cancel(id);
    const wasRunning = await taskRegistry.kill(task.id);

    if (wasInQueue || wasRunning) await db.update(videoVersions).set({ status: 'canceled' }).where(eq(videoVersions.id, id));

    return { wasInQueue, wasRunning };
};
