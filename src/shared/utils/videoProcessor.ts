import path from 'node:path';
import { spawn, type Subprocess } from 'bun';
import { VideoProcessingError } from '../../modules/movies/movies.errors';
import type { JobProgress } from '@duckflix/shared';
import { EventEmitter } from 'node:events';
import type { Interruptible } from './taskRegistry';

export interface FFprobeStream {
    index: number;
    codec_name?: string;
    codec_type?: 'video' | 'audio' | 'subtitle' | 'data';
    width?: number;
    height?: number;
    duration?: string;
    bit_rate?: string;
}

export interface FFprobeFormat {
    filename: string;
    nb_streams: number;
    format_name: string;
    duration: string;
    size: string;
    bit_rate: string;
}

export interface FFprobeData {
    streams: FFprobeStream[];
    format: FFprobeFormat;
}

export const ffprobe = async (filePath: string): Promise<FFprobeData> => {
    const absolutePath = path.resolve(filePath);

    const proc = spawn(['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', absolutePath]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        const errorText = await new Response(proc.stderr).text();
        throw new VideoProcessingError(`FFprobe failed`, new Error(errorText));
    }

    try {
        return (await new Response(proc.stdout).json()) as FFprobeData;
    } catch (e) {
        throw new VideoProcessingError('Failed to parse FFprobe JSON output', e);
    }
};

export type JobType = 'copy' | 'transcode';
const defaults: { h: number; limits: { bitrate: string; buf: string; audioBitrate: string } }[] = [
    { h: 2160, limits: { bitrate: '12M', buf: '24M', audioBitrate: '256k' } },
    { h: 1440, limits: { bitrate: '8M', buf: '16M', audioBitrate: '256k' } },
    { h: 1080, limits: { bitrate: '4M', buf: '8M', audioBitrate: '192k' } },
    { h: 0, limits: { bitrate: '2M', buf: '4M', audioBitrate: '128k' } },
];

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
        const matched = defaults.find(({ h }) => options.height >= h)!.limits;
        this.config = { ...matched, ...options };
    }
    public stop(): Promise<void> | void {
        if (this.proc) {
            this.proc.kill();
            this.proc = null;
        }
    }

    private args(config: { bitrate: string; buf: string; audioBitrate: string; isHvec: boolean; height: number }) {
        const cmd = 'ffmpeg';
        const base = [
            'nice',
            '-n',
            this.config.priority.toString(),
            cmd,
            '-progress',
            'pipe:1',
            '-v',
            'info',
            '-thread_queue_size',
            '1024',
            '-i',
            this.inputPath,
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
        ];

        const copyArgs = ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ac', '2'];
        const transcodeArgs = [
            '-vf',
            `scale=-2:${config.height}:flags=lanczos`,
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '20',
            '-maxrate',
            config.bitrate,
            '-bufsize',
            config.buf,
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            config.audioBitrate,
            '-ac',
            '2',
        ];

        const outputArgs = ['-sn', '-movflags', '+faststart', '-y', this.outputPath];

        const args = [
            ...base,
            ...(this.type === 'copy' ? copyArgs : transcodeArgs),
            ...(config.isHvec && this.type === 'copy' ? ['-tag:v', 'hvc1'] : []),
            ...outputArgs,
        ];

        return args;
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
        console.log(exitCode);

        return exitCode === 0;
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
