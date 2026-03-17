import { spawn, type Subprocess } from 'bun';
import type { JobProgress } from '@duckflix/shared';
import { EventEmitter } from 'node:events';
import type { Interruptible } from '../../utils/taskRegistry';
import { videoDefaults } from '../src/constants';
import { buildFfmpegArgs } from './args';
import { getHardwareDecodingSupport } from './hardware';
import { logger } from '../../configs/logger';

export type JobType = 'copy' | 'transcode';

export class VideoJob extends EventEmitter implements Interruptible {
    private config;
    private proc: null | Subprocess = null;
    constructor(
        private readonly inputPath: string,
        private readonly outputPath: string,
        private readonly type: JobType,
        options: { priority: number; height: number; isHvec: boolean; totalDuration?: number } = { height: 0, priority: 0, isHvec: false }
    ) {
        super();
        const matched = videoDefaults.find(({ h }) => options.height >= h)!.limits;
        this.config = { ...matched, ...options };
    }

    private args(config: { bitrate: string; buf: string; audioBitrate: string; isHvec: boolean; height: number }) {
        const cmd = 'ffmpeg';

        const hw = getHardwareDecodingSupport();
        const args = buildFfmpegArgs({ mode: 'vod', inputPath: this.inputPath, outputPath: this.outputPath, type: this.type, hw, config });

        return [cmd, ...args];
    }

    private async monitorProgress() {
        if (!this.proc?.stdout || typeof this.proc.stdout === 'number') return;

        const reader = this.proc.stdout.getReader();
        const decoder = new TextDecoder();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const rawData = decoder.decode(value);

                const matches = [...rawData.matchAll(/out_time=(\d{2}:\d{2}:\d{2})/g)];
                if (matches.length > 0) {
                    const lastMatch = matches[matches.length - 1];
                    if (!lastMatch) return;
                    const time = lastMatch[1];
                    const seconds = this.timeToSeconds(time);
                    let progress = undefined;
                    if (this.config.totalDuration) {
                        progress = Math.round((seconds / this.config.totalDuration) * 100);
                        if (progress > 100) progress = 100;
                    }
                    logger.debug({ id: this.proc.pid, progress, time }, '[VideoJob] processing progress');
                    this.emit('progress', { time, seconds, progress } as JobProgress);
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err: unknown) {
            // should catch silently
        } finally {
            reader.releaseLock();
        }
    }

    public async start(): Promise<boolean> {
        const ffmpegArgs = this.args(this.config);

        this.proc = spawn(ffmpegArgs, {
            stdout: 'pipe',
            stderr: 'pipe',
        });

        this.monitorProgress();

        const exitCode = await this.proc.exited;

        return exitCode === 0;
    }

    public pause(): void {
        if (this.proc) process.kill(this.proc.pid, 'SIGSTOP');
        this.emit('pause');
    }

    public resume() {
        if (this.proc) process.kill(this.proc.pid, 'SIGCONT');
        this.emit('resume');
    }

    public kill() {
        if (this.proc) {
            this.proc.kill();
            this.proc = null;
        }
    }

    private timeToSeconds(time?: string): number {
        if (!time) return 0;
        const [h, m, s] = time.split(':').map(Number);
        return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
    }

    public destroy() {
        this.kill();
        this.removeAllListeners();
    }
}
