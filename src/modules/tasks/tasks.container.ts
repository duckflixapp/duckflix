import { taskHandler } from '@utils/taskHandler';
import { taskRegistry } from '@utils/taskRegistry';
import { drizzleTasksRepository } from './tasks.drizzle.repository';
import { createTasksService } from './tasks.service';

export const tasksService = createTasksService({
    tasksRepository: drizzleTasksRepository,
    waitingTaskQueue: taskHandler,
    activeTaskRegistry: taskRegistry,
});
