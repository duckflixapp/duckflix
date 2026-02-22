import { randomUUID } from 'node:crypto';
import { Queue } from './queue';
import { systemSettings } from '../services/system.service';
import { logger } from './logger';

export type Runnable = (...args: unknown[]) => Promise<number>;
export type TaskStatus = 'working' | 'waiting';

type TaskEvents = {
    started: [taskId: string];
    completed: [taskId: string];
    canceled: [taskId: string];
    error: [taskId: string, error: unknown];
};

interface Task {
    id: string;
    run: Runnable;
}

export class TaskHandler {
    private taskQueue = new Queue<Task>();
    private tasksMap = new Map<string, true>();
    private current: Task[] = [];
    private concurrent: number = 1;

    private listeners: { [K in keyof TaskEvents]?: ((...args: TaskEvents[K]) => void)[] } = {};

    constructor(params: { concurrent: number } = { concurrent: 1 }) {
        this.concurrent = params.concurrent;
    }

    /**
     * Returns the current overall status of the task handler.
     * @returns 'working' if a task is currently being processed, 'waiting' otherwise.
     */
    public get status(): TaskStatus {
        return this.current.length !== 0 ? 'working' : 'waiting';
    }

    /**
     * Checks the status of a specific task by its ID.
     * @param taskId - The unique identifier of the task.
     * @returns 'working' if active, 'waiting' if in queue, or undefined if not found.
     */
    public check(taskId: string): TaskStatus | undefined {
        for (const task of this.current) {
            if (task.id === taskId) return 'working';
        }
        return this.tasksMap.has(taskId) ? 'waiting' : undefined;
    }

    /**
     * Adds a new runnable task to the execution queue.
     * @param runnable - An asynchronous function to be executed.
     * @param id - Optional custom identifier for the task.
     * @returns The unique identifier assigned to the task.
     */
    public handle(runnable: Runnable, id?: string): string {
        const task = { id: id ?? randomUUID(), run: runnable };
        this.taskQueue.add(task);
        this.tasksMap.set(task.id, true);
        void this.checkQueue();
        return task.id;
    }

    /**
     * Removes a task from the queue if it hasn't started yet.
     * @param taskId - The unique identifier of the task.
     * @returns true if the task was removed from queue, false otherwise.
     */
    public cancel(taskId: string): boolean {
        if (this.tasksMap.has(taskId)) {
            this.taskQueue.removeWhere((t) => t.id === taskId);

            this.tasksMap.delete(taskId);

            logger.info({ taskId }, `Task cancelled before it started.`);
            return true;
        }

        return false;
    }

    /**
     * Calculates the current position of a task within the entire workflow.
     * @param taskId - The unique identifier of the task.
     * @returns 0 if currently processing, a positive integer for queue position, or -1 if not found.
     */
    public findPosition(taskId: string) {
        // check if already running
        for (const task of this.current) {
            if (task.id === taskId) return 0;
        }
        const position = this.taskQueue.findPosition((t) => t.id === taskId);
        return position >= 0 ? position + 1 : -1;
    }

    private async checkQueue(): Promise<void> {
        while (this.current.length < this.concurrent && !this.taskQueue.isEmpty) {
            await this.process();
        }
    }

    /**
     * If task return 0 it should be marked as success, 1 as canceled and other values are ignored
     */
    private async process() {
        const task = this.taskQueue.remove() as Task;
        this.current.push(task);
        this.tasksMap.delete(task.id);
        this.emit('started', task.id);
        task.run()
            .then((r) => {
                this.current = [...this.current.filter((t) => t.id !== task.id)];
                const status = r === 0 ? 'completed' : r === 1 ? 'canceled' : null;
                if (!status) return;
                this.emit(status, task.id);
            })
            .catch((e) => {
                this.current = [...this.current.filter((t) => t.id !== task.id)];
                this.emit('error', task.id, e);
            })
            .finally(() => this.checkQueue());
    }

    private emit<K extends keyof TaskEvents>(event: K, ...args: TaskEvents[K]) {
        this.listeners[event]?.forEach((callback) => callback(...args));
    }

    /**
     * Registers a callback function for a specific task event.
     * @param event - The name of the event to listen for.
     * @param callback - The function to be executed when the event is emitted.
     */
    public addListener<K extends keyof TaskEvents>(event: K, callback: (...args: TaskEvents[K]) => void) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    /**
     * Removes a previously registered callback function for a specific task event.
     * @param event - The name of the event.
     * @param callback - The reference of the callback to remove.
     * @returns True if the listener was found and removed, false otherwise.
     */
    public removeListener<K extends keyof TaskEvents>(event: K, callback: (...args: TaskEvents[K]) => void): boolean {
        if (!this.listeners[event]) return false;
        const index = this.listeners[event].findIndex((v) => v == callback);
        if (index === -1) return false;
        this.listeners[event]?.splice(index, 1);
        return true;
    }

    /**
     * Removes all previously registered callback functions for a specific task event if event is provided.
     * If event is not provided it clears all listeners.
     * @param event - The name of the event.
     */
    public clearListeners<K extends keyof TaskEvents>(event?: K): void {
        if (!event) {
            this.listeners = {};
            return;
        }

        if (!this.listeners[event]) return;
        this.listeners[event] = [];
    }
}

const sysSettings = await systemSettings.get(); // this wont change without restart, should not be changed for stability reasons
export const taskHandler = new TaskHandler({ concurrent: sysSettings.features.concurrentProcessing });
