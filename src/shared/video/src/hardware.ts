import { spawn } from 'bun';

export type HardwareSupport = {
    videotoolbox: boolean;
    nvdec: boolean;
    qsv: boolean;
};

let cachedSupport: HardwareSupport = { nvdec: false, videotoolbox: false, qsv: false };

export const getHardwareDecodingSupport = (): HardwareSupport => ({ ...cachedSupport });

export const checkHardwareDecoding = async (): Promise<HardwareSupport> => {
    try {
        const process = spawn(['ffmpeg', '-hwaccels', '-loglevel', 'panic'], { stdout: 'pipe' });

        await process.exited;

        const text = await new Response(process.stdout).text();
        const output = text.toLowerCase();

        cachedSupport = {
            nvdec: output.includes('nvdec') || output.includes('nvidia'), // NVIDIA
            videotoolbox: output.includes('videotoolbox'), // macOS
            qsv: output.includes('qsv'), // Intel QuickSync
        } satisfies HardwareSupport;

        return cachedSupport;
    } catch {}

    return { nvdec: false, videotoolbox: false, qsv: false };
};
