import { beforeEach, describe, expect, mock, test } from 'bun:test';

mock.module('@shared/services/system.service', () => ({
    systemSettings: {
        get: async () => ({
            features: {
                concurrentProcessing: 1,
            },
        }),
    },
}));

const { TaskHandler } = await import('../taskHandler');

describe('TaskHandler', () => {
    let handler: InstanceType<typeof TaskHandler>;

    beforeEach(() => {
        handler = new TaskHandler();
    });

    test('should add a task and return a valid UUID', () => {
        const taskId = handler.handle(async () => 1);
        expect(typeof taskId).toBe('string');
        expect(taskId.length).toBeGreaterThan(0);
    });

    test('should process tasks one by one in correct order', async () => {
        const results: number[] = [];

        const createTask = (val: number, ms: number) => async () => {
            await new Promise((resolve) => setTimeout(resolve, ms));
            results.push(val);
            return 0;
        };

        handler.handle(createTask(1, 50));
        handler.handle(createTask(2, 5));
        handler.handle(createTask(3, 10));

        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(handler.status).toEqual('waiting');
        expect(results).toEqual([1, 2, 3]);
    });

    test('should emit "start" and "completed" events', async () => {
        const createTask = (val: number, ms: number) => async () => {
            await new Promise((resolve) => setTimeout(resolve, ms));
            return val;
        };

        const started = new Promise<void>((resolve, reject) => {
            handler.addListener('started', () => {
                try {
                    expect(handler.status).toBe('working');
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });

        const completed = new Promise<void>((resolve, reject) => {
            handler.addListener('completed', () => {
                try {
                    expect(handler.status).toBe('waiting');
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });

        handler.handle(createTask(0, 50));

        await started;
        await completed;
    });

    test('should emit "error" event when task fails', async () => {
        const errorMsg = 'Boom!';
        const errorEvent = new Promise<void>((resolve, reject) => {
            const taskId = handler.handle(async () => {
                throw new Error(errorMsg);
            });

            handler.addListener('error', (id: string, err: unknown) => {
                try {
                    expect(id).toBe(taskId);
                    expect((err as Error).message).toBe(errorMsg);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });

        await errorEvent;
    });

    test('should correctly report status via check()', async () => {
        const task1Id = handler.handle(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return 0;
        });
        const task2Id = handler.handle(async () => 0);

        expect(handler.check(task1Id)).toBe('working');
        expect(handler.check(task2Id)).toBe('waiting');

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(handler.check(task1Id)).toBeUndefined();
    });

    test('should be able to remove listeners', async () => {
        let callCount = 0;
        const callback = () => {
            callCount++;
        };

        handler.addListener('completed', callback);
        handler.removeListener('completed', callback);

        handler.handle(async () => 0);

        await new Promise((resolve) => setTimeout(resolve, 25));

        expect(callCount).toBe(0);
    });

    test('should respect concurrency limit (max 2 active tasks)', async () => {
        const ch = new TaskHandler({ concurrent: 2 });
        let activeCount = 0;
        let maxObservedActive = 0;

        const createTask = () => async () => {
            activeCount++;
            maxObservedActive = Math.max(maxObservedActive, activeCount);
            await new Promise((r) => setTimeout(r, 20));
            activeCount--;
            return 0;
        };

        for (let i = 0; i < 5; i++) {
            ch.handle(createTask());
        }

        await new Promise((r) => setTimeout(r, 150));
        expect(maxObservedActive).toBe(2);
    });

    test('should finish faster tasks first when running in parallel', async () => {
        const ch = new TaskHandler({ concurrent: 3 });
        const results: number[] = [];

        const createTask = (val: number, ms: number) => async () => {
            await new Promise((r) => setTimeout(r, ms));
            results.push(val);
            return 0;
        };

        ch.handle(createTask(1, 100));
        ch.handle(createTask(2, 50));
        ch.handle(createTask(3, 10));

        await new Promise((r) => setTimeout(r, 150));

        expect(results).toEqual([3, 2, 1]);
    });

    test('should report correct position for tasks waiting behind workers', async () => {
        const ch = new TaskHandler({ concurrent: 2 });

        const t1 = ch.handle(async () => await new Promise((r) => setTimeout(r, 100)));
        const t2 = ch.handle(async () => await new Promise((r) => setTimeout(r, 100)));

        const t3 = ch.handle(async () => 0);
        const t4 = ch.handle(async () => 0);

        expect(ch.findPosition(t1)).toBe(0);
        expect(ch.findPosition(t2)).toBe(0);
        expect(ch.findPosition(t3)).toBe(1);
        expect(ch.findPosition(t4)).toBe(2);

        await new Promise((r) => setTimeout(r, 150));
    });
});
