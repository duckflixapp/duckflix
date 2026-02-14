import path from 'node:path';
import { spawn } from './thread.utils';
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
    const proc = await spawn('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', absolutePath]);

    const text = await proc.getStdout();
    const errorText = await proc.getStderr();
    const exitCode = await proc.wait();

    if (exitCode !== 0) {
        throw new VideoProcessingError(`FFprobe failed`, new Error(errorText));
    }

    try {
        return JSON.parse(text) as FFprobeData;
    } catch (e) {
        throw new VideoProcessingError('Failed to parse FFprobe JSON output', e);
    }
};

export const transcode = async (inputPath: string, outputPath: string, targetHeight: number): Promise<string> => {
    const limits: Record<number, { bitrate: string; buf: string }> = {
        2160: { bitrate: '12M', buf: '24M' }, // 4K
        1440: { bitrate: '8M', buf: '16M' }, // UHD
        1080: { bitrate: '4M', buf: '8M' }, // FHD
        720: { bitrate: '2M', buf: '4M' }, // HD
        480: { bitrate: '1M', buf: '2M' }, // SD
    };
    const config = limits[targetHeight] || { bitrate: '2M', buf: '4M' };

    const proc = await spawn('ffmpeg', [
        '-v',
        'error',
        '-i',
        inputPath,
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
        '-movflags',
        '+faststart',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-y',
        outputPath,
    ]);

    const errorOutput = await proc.getStderr();
    const exitCode = await proc.wait();

    if (exitCode !== 0) {
        const msg = errorOutput.toLowerCase();
        let userFriendlyMsg = `Transcoding failed at ${targetHeight}p`;

        if (msg.includes('no space left')) userFriendlyMsg = 'Disk full during transcoding.';
        else if (msg.includes('invalid argument')) userFriendlyMsg = 'Invalid video parameters or codec mismatch.';
        else if (msg.includes('out of memory')) userFriendlyMsg = 'Server ran out of RAM during processing.';

        throw new VideoProcessingError(userFriendlyMsg, new Error(errorOutput));
    }
    return outputPath;
};
