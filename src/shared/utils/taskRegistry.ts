import { logger } from './logger';

export interface Interruptible {
    stop(): Promise<void> | void;
    pause(): Promise<void> | void;
    resume(): Promise<void> | void;
}

class TaskRegistry {
    private activeJobs = new Map<string, Interruptible>();

    public register(id: string, job: Interruptible) {
        this.activeJobs.set(id, job);
    }

    public unregister(id: string) {
        this.activeJobs.delete(id);
    }

    public async kill(id: string) {
        const job = this.activeJobs.get(id);
        if (!job) return false;
        await job.stop();
        this.activeJobs.delete(id);
        return true;
    }

    public async pauseAll() {
        const promises = Array.from(this.activeJobs.keys()).map(this.pause);
        await Promise.all(promises);
    }

    public async resumeAll() {
        const promises = Array.from(this.activeJobs.keys()).map(this.resume);
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
