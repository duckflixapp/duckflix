export type VideoTaskRecord = {
    id: string;
};

export interface TasksRepository {
    findVideoTask(id: string): Promise<VideoTaskRecord | null>;
    markVideoTaskCanceled(id: string): Promise<void>;
}

export interface WaitingTaskQueue {
    cancel(id: string): boolean;
}

export interface ActiveTaskRegistry {
    kill(id: string): Promise<boolean>;
}
