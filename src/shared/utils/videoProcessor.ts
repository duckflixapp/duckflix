import path from 'node:path';
import { spawn } from 'bun';
import { VideoProcessingError } from '../../modules/movies/movies.errors';

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

export const copy = async (inputPath: string, outputPath: string, options?: { isHEVC: boolean }): Promise<string> => {
    const args = [
        'nice',
        '-n',
        '10',
        'ffmpeg',
        '-v',
        'error',
        '-thread_queue_size',
        '1024',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '256k',
        '-ac',
        '2',
        '-sn',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
    ];
    if (options?.isHEVC) args.push('-tag:v', 'hvc1');
    const proc = spawn(args);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        const errorOutput = await new Response(proc.stderr).text();
        throw new VideoProcessingError(`Fast-copy failed`, new Error(errorOutput));
    }

    return outputPath;
};

const limits: { h: number; limits: { bitrate: string; buf: string; audioBitrate: string } }[] = [
    { h: 2160, limits: { bitrate: '12M', buf: '24M', audioBitrate: '256k' } },
    { h: 1440, limits: { bitrate: '8M', buf: '16M', audioBitrate: '256k' } },
    { h: 1080, limits: { bitrate: '4M', buf: '8M', audioBitrate: '192k' } },
    { h: 0, limits: { bitrate: '2M', buf: '4M', audioBitrate: '128k' } },
];

export const transcode = async (inputPath: string, outputPath: string, targetHeight: number): Promise<string> => {
    const config = limits.find(({ h }) => targetHeight >= h)!.limits;

    const proc = spawn([
        'nice',
        '-n',
        '10',
        'ffmpeg',
        '-v',
        'error',
        '-thread_queue_size',
        '1024',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-vf',
        `scale=-2:${targetHeight}:flags=lanczos`,
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
        '-sn',
        '-movflags',
        '+faststart',
        '-c:a',
        'aac',
        '-b:a',
        config.audioBitrate,
        '-ac',
        '2',
        '-y',
        outputPath,
    ]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        const errorOutput = await new Response(proc.stderr).text();
        const msg = errorOutput.toLowerCase();

        let userFriendlyMsg = `Transcoding failed at ${targetHeight}p`;
        if (msg.includes('no space left')) userFriendlyMsg = 'Disk full during transcoding.';
        else if (msg.includes('invalid argument')) userFriendlyMsg = 'Invalid parameters.';

        throw new VideoProcessingError(userFriendlyMsg, new Error(errorOutput));
    }

    return outputPath;
};
