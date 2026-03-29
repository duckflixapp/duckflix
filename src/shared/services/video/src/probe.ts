import { spawn } from 'bun';
import path from 'path';
import { AppError } from '@shared/errors';

export interface FFprobeStream {
    index: number;
    codec_name?: string;
    codec_type?: 'video' | 'audio' | 'subtitle' | 'data';
    width?: number;
    height?: number;
    duration?: string;
    bit_rate?: string;
    tags: FFProbeStreamTags;
}

export interface FFProbeStreamTags {
    language?: string;
    title?: string;
    [key: string]: string | undefined;
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
        throw new AppError(`FFprobe failed`, { cause: new Error(errorText), statusCode: 500 });
    }

    try {
        return (await new Response(proc.stdout).json()) as FFprobeData;
    } catch (e) {
        throw new AppError('Failed to parse FFprobe JSON output', { cause: e });
    }
};
