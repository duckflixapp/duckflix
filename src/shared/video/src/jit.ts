import type { Subprocess } from 'bun';
import { buildFfmpegArgs } from './args';
import { videoDefaults } from './constants';
import { getHardwareDecodingSupport } from './hardware';

export interface VideoProcess {
    proc: Subprocess;
    stop: () => void;
    onSegment?: (cb: (seg: number) => void) => void;
    onProgress?: (cb: (p: Subprocess) => void) => void;
}

const SEG_OPEN_RE = /Opening '.*?seg-(\d+)\.ts\.tmp'/;

const parseSegmentStream = async (stderr: ReadableStream<Uint8Array>, onSegment: (seg: number) => void): Promise<void> => {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let pending: number | null = null;
    let leftover = '';

    try {
        for await (const chunk of stderr) {
            const text = leftover + decoder.decode(chunk, { stream: true });
            const lines = text.split('\n');
            leftover = lines.pop() ?? '';

            for (const line of lines) {
                const match = SEG_OPEN_RE.exec(line);
                if (match?.[1]) {
                    pending = parseInt(match[1]);
                }
                if (line.includes('index.m3u8.tmp') && pending !== null) {
                    onSegment(pending);
                    pending = null;
                }
            }
        }
    } catch (err) {
        console.error(err);
    }
};

export async function createJitRunner(opts: {
    input: string;
    outputDir: string;
    segment: number;
    height: number;
    duration: number;
}): Promise<VideoProcess> {
    const hw = getHardwareDecodingSupport();
    const config = videoDefaults.find((v) => opts.height >= v.h)!.limits;

    const args = buildFfmpegArgs({
        inputPath: opts.input,
        outputPath: `${opts.outputDir}/index.m3u8`,
        type: 'transcode',
        mode: 'jit',
        hw,
        config: { ...config, height: opts.height, isHvec: false },
        jit: {
            startTime: opts.segment * opts.duration,
            startNumber: opts.segment,
            segmentDuration: opts.duration,
        },
    });

    const proc = Bun.spawn(['ffmpeg', ...args], { stderr: 'pipe' });

    return {
        proc,
        stop: () => proc.kill(),
        onSegment: (cb) => parseSegmentStream(proc.stderr, cb),
    };
}
