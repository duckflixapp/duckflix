import path from 'node:path';
import type { HardwareSupport } from './hardware';

export type JobMode = 'vod' | 'jit';

export interface VideoConfig {
    bitrate: string;
    buf: string;
    audioBitrate: string;
    height: number;
    isHvec: boolean;
}

export interface BuildArgsOptions {
    mode: JobMode;
    inputPath: string;
    outputPath: string;
    type: 'copy' | 'transcode';
    hw: HardwareSupport;
    config: VideoConfig;
    jit?: {
        startTime: number;
        startNumber: number;
        segmentDuration: number;
    };
}

const buildHardwareAccelFlags = (hw: HardwareSupport) => {
    if (hw.videotoolbox) return ['-hwaccel', 'videotoolbox'];
    if (hw.nvdec) return ['-hwaccel', 'cuda'];
    if (hw.qsv) return ['-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv'];
    return [];
};

const buildVideoCodecArgs = (hw: HardwareSupport, mode: JobMode, config: VideoConfig) => {
    if (hw.nvdec) {
        const preset = mode === 'jit' ? 'p3' : 'p6';
        return ['-c:v', 'h264_nvenc', '-preset', preset, '-b:v', config.bitrate];
    }

    if (hw.videotoolbox) {
        return [
            '-c:v',
            'h264_videotoolbox',
            '-b:v',
            config.bitrate,
            '-realtime',
            mode === 'jit' ? '1' : '0',
            '-profile:v',
            'high',
            '-allow_sw',
            '1',
        ];
    }

    if (hw.qsv) {
        const preset = mode === 'jit' ? 'veryfast' : 'medium';
        return ['-c:v', 'h264_qsv', '-preset', preset, '-b:v', config.bitrate];
    }

    const preset = mode === 'jit' ? 'ultrafast' : 'medium';
    return [
        '-c:v',
        'libx264',
        '-preset',
        preset,
        ...(mode === 'jit' ? ['-tune', 'zerolatency'] : []),
        '-crf',
        '21',
        '-maxrate',
        config.bitrate,
        '-bufsize',
        config.buf,
    ];
};

export const buildFfmpegArgs = (opts: BuildArgsOptions): string[] => {
    const { inputPath, outputPath, type, hw, mode, config, jit } = opts;

    const base = ['-progress', 'pipe:1', '-v', 'info'];

    if (mode === 'jit' && jit) {
        base.push('-ss', jit.startTime.toString());
    }

    base.push(...buildHardwareAccelFlags(hw));
    base.push('-i', inputPath, '-map', '0:v:0', '-map', '0:a:0?');

    let videoArgs: string[] = [];
    if (type === 'copy') {
        videoArgs = ['-c:v', 'copy'];
        if (config.isHvec) videoArgs.push('-tag:v', 'hvc1');
    } else {
        videoArgs = buildVideoCodecArgs(hw, mode, config);
        videoArgs.push('-vf', `scale=-2:${config.height}:force_original_aspect_ratio=decrease`, '-pix_fmt', 'yuv420p');
    }

    if (mode === 'jit' && jit) {
        videoArgs.push('-force_key_frames', `expr:gte(t,n_forced*${jit.segmentDuration})`);
    }

    const hlsOptions = [
        '-f',
        'hls',
        '-hls_time',
        mode === 'jit' ? jit?.segmentDuration.toString() || '6' : '6',
        '-hls_playlist_type',
        mode === 'jit' ? 'event' : 'vod',
        '-hls_segment_filename',
        path.join(path.dirname(outputPath), 'seg-%d.ts'),
        '-hls_flags',
        'temp_file+independent_segments',
    ];

    if (mode === 'jit' && jit) {
        hlsOptions.push('-hls_list_size', '0');
        hlsOptions.push('-start_number', jit.startNumber.toString());
        hlsOptions.push('-output_ts_offset', jit.startTime.toString());
    }
    return [...base, ...videoArgs, '-c:a', 'aac', '-b:a', '192k', ...hlsOptions, '-y', outputPath];
};
