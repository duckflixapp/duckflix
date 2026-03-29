import { EventEmitter } from 'node:events';
import { logger } from '@shared/configs/logger';
import type { Subprocess } from 'bun';
import fs from 'node:fs/promises';
import { taskRegistry } from '@utils/taskRegistry';
import { createJitRunner } from '@shared/services/video';

export class SessionTask {
    private process: Subprocess | null = null;
    private readySegments = new Set<number>();
    private lastSegment: null | number = null;
    private notifier = new EventEmitter();
    private inactivityTimer: Timer | null = null;

    constructor(
        private readonly session: string,
        private readonly originalPath: string,
        private readonly outputPath: string,
        private readonly segmentDuration: number,
        private height: number,
        private readonly totalSegments: number,
        private onCleanup: () => unknown
    ) {}

    public async initalize(): Promise<void> {
        await fs.mkdir(this.outputPath, { recursive: true });
    }

    public async prepareSegment(segment: number, options?: { height: number }) {
        this.resetInactivityTimer();

        if (options?.height && options.height != this.height) {
            logger.debug({ from: this.height, to: options.height }, 'height changed');
            await this.stopReset();
            this.height = options.height;
        }

        if (this.readySegments.has(segment)) {
            this.lastSegment = segment;
            await this.clearOldest();
            return;
        }

        const readyArray = this.readySegments.values().toArray();
        const oldestSegment = readyArray.length > 0 ? Math.min(...readyArray) : null;
        const needsRestart =
            !this.process ||
            this.lastSegment == null ||
            segment > this.lastSegment + 2 ||
            (oldestSegment !== null && segment < oldestSegment);

        if (needsRestart) {
            await this.stopReset();
            this.transcode(segment);
        }

        this.lastSegment = segment;
        this.clearOldest();

        return new Promise<void>((resolve, reject) => {
            let timeout: NodeJS.Timeout;

            if (this.notifier.listenerCount(`ready_${segment}`) > 0) {
                const listener = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                timeout = setTimeout(() => reject(), 18_000);
                this.notifier.once(`ready_${segment}`, listener);
                return;
            }

            logger.debug({ segment }, 'Waiting for segment');

            const listener = () => {
                this.notifier.removeListener(`ready_${segment}`, listener);
                logger.debug({ segment }, 'Segment ready');
                clearTimeout(timeout);
                setTimeout(resolve, 500);
            };

            timeout = setTimeout(() => {
                this.notifier.removeListener(`ready_${segment}`, listener);
                reject();
            }, 20_000); // 20s is more than enough for fail request

            this.notifier.once(`ready_${segment}`, listener);
        });
    }

    private async transcode(segment: number) {
        const runner = await createJitRunner({
            input: this.originalPath,
            outputDir: this.outputPath,
            segment,
            height: this.height,
            duration: this.segmentDuration,
        });

        this.process = runner.proc;

        runner.onSegment!((segNum) => {
            this.readySegments.add(segNum);
            this.notifier.emit(`ready_${segNum}`);
        });

        try {
            logger.debug({ segment, session: this.session }, 'FFmpeg started');
            taskRegistry.pauseAll();
            await runner.proc.exited;
            taskRegistry.resumeAll();
            logger.debug({ segment, session: this.session, statusCode: runner.proc.exitCode }, 'FFmpeg exited');
            this.process = null;

            logger.debug({ code: runner.proc.exitCode }, 'FFmpeg finished');
        } catch (err) {
            logger.error({ err, session: this.session }, 'Failed to spawn FFmpeg');
            throw err;
        }
    }

    private async clearOldest() {
        const KEEP_BUFFER = 12; // aprx 72s
        if (this.lastSegment === null) return;

        const segmentsToRemove = this.readySegments.values().filter((seg) => seg < this.lastSegment! - KEEP_BUFFER);
        for (const seg of segmentsToRemove) {
            try {
                await fs.unlink(`${this.outputPath}/seg-${seg}.ts`);
                this.readySegments.delete(seg);
            } catch (e) {
                logger.error({ e }, 'Old segment not deleted');
            }
        }
    }

    private resetInactivityTimer() {
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);

        this.inactivityTimer = setTimeout(() => {
            logger.debug({ session: this.session, height: this.height }, 'Session inactive, killing FFmpeg');
            this.destroy();
        }, 45_000);
    }

    private async stopReset() {
        if (this.process) {
            this.process.kill(9);
            await this.process.exited.catch(() => {});
            this.process = null;
        }

        this.readySegments.clear();
        this.lastSegment = null;
    }

    public async destroy() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
        await this.stopReset();
        this.onCleanup();

        try {
            const files = await fs.readdir(this.outputPath);
            await Promise.all(files.map((file) => fs.unlink(`${this.outputPath}/${file}`)));
        } catch {
            await fs.mkdir(this.outputPath, { recursive: true });
        }
    }
}
