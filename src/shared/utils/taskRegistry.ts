import { logger } from '@shared/configs/logger';

export interface Interruptible {
    kill(): Promise<void> | void;
    pause(): Promise<void> | void;
    resume(): Promise<void> | void;
}

export class TaskRegistry {
    private activeJobs = new Map<string, Interruptible>();
    private pauseRef: number = 0;

    public get isPaused() {
        return this.pauseRef !== 0;
    }

    public register(id: string, job: Interruptible) {
        this.activeJobs.set(id, job);
        if (this.isPaused) job.pause();
    }

    public unregister(id: string) {
        this.activeJobs.delete(id);
    }

    public async kill(id: string) {
        const job = this.activeJobs.get(id);
        if (!job) return false;
        await job.kill();
        this.activeJobs.delete(id);
        return true;
    }

    public async pauseAll() {
        logger.debug({ ref: this.pauseRef }, 'All tasks pause');
        this.pauseRef++;
        if (this.pauseRef !== 1) return; // already paused
        logger.debug({ ref: this.pauseRef }, 'Pausing tasks');
        const promises = Array.from(this.activeJobs.keys()).map((id) => this.pause(id));
        await Promise.all(promises);
    }

    public async resumeAll() {
        logger.debug({ ref: this.pauseRef }, 'All tasks resume');
        this.pauseRef--;
        if (this.pauseRef !== 0) return;
        logger.debug({ ref: this.pauseRef }, 'Resuming tasks');

        const promises = Array.from(this.activeJobs.keys()).map((id) => this.resume(id));
        await Promise.all(promises);
    }

    private async pause(id: string) {
        const job = this.activeJobs.get(id);
        if (!job) return false;
        await job.pause();
        logger.debug({ task: id }, 'paused');
        return true;
    }

    private async resume(id: string) {
        const job = this.activeJobs.get(id);
        if (!job) return false;
        await job.resume();
        logger.debug({ task: id }, 'resumed');
        return true;
    }
}

export const taskRegistry = new TaskRegistry();
