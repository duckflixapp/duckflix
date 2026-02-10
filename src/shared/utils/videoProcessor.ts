import path from 'node:path';

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
    const proc = Bun.spawn(['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', absolutePath]);

    const text = await new Response(proc.stdout).text();

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
        throw new Error('FFprobe failed to read file');
    }

    return JSON.parse(text) as FFprobeData;
};

export const transcode = async (inputPath: string, outputPath: string, targetHeight: number): Promise<string> => {
    const proc = Bun.spawn([
        'ffmpeg',
        '-v',
        'error',
        '-i',
        inputPath,
        '-vf',
        `scale=-2:${targetHeight}`,
        '-c:v',
        'libx264',
        '-crf',
        '23',
        '-movflags',
        '+faststart',
        '-preset',
        'medium',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-y',
        outputPath,
    ]);

    await proc.exited;

    if (proc.exitCode !== 0) throw new Error(`FFmpeg transcoding failed for height ${targetHeight}`);
    return outputPath;
};
