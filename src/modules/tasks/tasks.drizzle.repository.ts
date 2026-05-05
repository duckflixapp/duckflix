import { eq } from 'drizzle-orm';

import { db } from '@shared/configs/db';
import { videoVersions } from '@schema/video.schema';
import type { TasksRepository } from './tasks.ports';

export const drizzleTasksRepository: TasksRepository = {
    async findVideoTask(id: string) {
        const task = await db.query.videoVersions.findFirst({
            where: eq(videoVersions.id, id),
        });

        return task ? { id: task.id } : null;
    },

    async markVideoTaskCanceled(id: string) {
        await db.update(videoVersions).set({ status: 'canceled' }).where(eq(videoVersions.id, id));
    },
};
