export interface Interruptible {
    stop(): Promise<void> | void;
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
        if (job) {
            await job.stop();
            this.activeJobs.delete(id);
            return true;
        }
        return false;
    }
}

export const taskRegistry = new TaskRegistry();
