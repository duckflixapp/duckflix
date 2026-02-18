import fs from 'node:fs/promises';
import { spawn } from 'bun';
import { SubtitleConversionError } from '../../modules/movies/movies.errors';

export const getMimeTypeFromFormat = (formatName: string): string => {
    if (formatName.includes('mp4')) return 'video/mp4';
    if (formatName.includes('matroska')) return 'video/x-matroska';
    if (formatName.includes('avi')) return 'video/x-msvideo';
    if (formatName.includes('webm')) return 'video/webm';
    return 'other'; // Fallback
};

export const convertSRTtoVTT = async (stream: ReadableStream | null, outputPath: string): Promise<void> => {
    if (!stream) throw new SubtitleConversionError('No stream provided');

    const ffmpeg = spawn(['ffmpeg', '-f', 'srt', '-i', '-', '-f', 'webvtt', '-y', outputPath], {
        stdin: stream,
        stdout: 'ignore',
        stderr: 'pipe',
    });

    const exitCode = await ffmpeg.exited;

    if (exitCode !== 0) {
        const errorOutput = await new Response(ffmpeg.stderr).text();
        await fs.unlink(outputPath).catch(() => {});
        throw new SubtitleConversionError(`FFmpeg failed (code ${exitCode})`, errorOutput);
    }
};
