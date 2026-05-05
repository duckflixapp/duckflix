import { TaskNotFoundError } from './tasks.errors';
import type { ActiveTaskRegistry, TasksRepository, WaitingTaskQueue } from './tasks.ports';

type TasksServiceDependencies = {
    tasksRepository: TasksRepository;
    waitingTaskQueue: WaitingTaskQueue;
    activeTaskRegistry: ActiveTaskRegistry;
};

export const createTasksService = ({ tasksRepository, waitingTaskQueue, activeTaskRegistry }: TasksServiceDependencies) => {
    const killMovieTask = async (id: string) => {
        const task = await tasksRepository.findVideoTask(id);

        if (!task) throw new TaskNotFoundError();

        const wasInQueue = waitingTaskQueue.cancel(id);
        const wasRunning = await activeTaskRegistry.kill(task.id);

        if (wasInQueue || wasRunning) await tasksRepository.markVideoTaskCanceled(id);

        return { wasInQueue, wasRunning };
    };

    return {
        killMovieTask,
    };
};

export type TasksService = ReturnType<typeof createTasksService>;
