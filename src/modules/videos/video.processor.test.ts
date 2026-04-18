import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { FFprobeData } from '@shared/services/video/src/probe';

const calls = {
    taskHandlerAddListener: [] as Array<{ event: string }>,
    taskHandlerHandle: [] as Array<{ id: string }>,
    dbInsertValues: [] as unknown[],
    dbUpdateSet: [] as unknown[],
    mkdir: [] as Array<{ path: string; options?: object }>,
    access: [] as string[],
    rm: [] as Array<{ path: string; options?: object }>,
    readdir: [] as string[],
    stat: [] as string[],
    ffprobe: [] as string[],
    videoJobConstruct: [] as unknown[],
    videoJobAddListener: [] as Array<{ event: string }>,
    videoJobStart: [] as unknown[],
    videoJobDestroy: [] as unknown[],
    emitVideoProgress: [] as unknown[],
    handleProcessingError: [] as unknown[],
    taskRegistryRegister: [] as Array<{ id: string }>,
    taskRegistryUnregister: [] as string[],
};

type Runnable = () => Promise<number>;

const queuedRunnables = new Map<string, Runnable>();

let uuidCounter = 0;
let accessImpl = async (_path: string) => {};
let ffprobeImpl = async (_path: string): Promise<FFprobeData> => ({
    format: {
        filename: '',
        nb_streams: 1,
        format_name: 'matroska',
        duration: '120',
        size: '1000',
        bit_rate: '1000000',
    },
    streams: [
        { index: 0, codec_name: 'h264', codec_type: 'video', width: 1920, height: 1080, duration: '120', bit_rate: '1000000', tags: {} },
    ],
});
let readdirImpl = async (_path: string) => ['index.m3u8', 'segment.ts'];
let statImpl = async (_path: string) => ({ size: 500 });
let jobStartImpl = async () => true;

mock.module('node:crypto', () => ({
    randomUUID: () => `uuid-${++uuidCounter}`,
}));

mock.module('@shared/services/system.service', () => ({
    systemSettings: {
        get: async () => ({
            features: {
                concurrentProcessing: 1,
            },
        }),
    },
}));

mock.module('node:fs/promises', () => ({
    default: {
        mkdir: async (dirPath: string, options?: object) => {
            calls.mkdir.push({ path: dirPath, options });
        },
        access: async (filePath: string) => {
            calls.access.push(filePath);
            return accessImpl(filePath);
        },
        rm: async (targetPath: string, options?: object) => {
            calls.rm.push({ path: targetPath, options });
        },
        readdir: async (dirPath: string) => {
            calls.readdir.push(dirPath);
            return await readdirImpl(dirPath);
        },
        stat: async (filePath: string) => {
            calls.stat.push(filePath);
            return await statImpl(filePath);
        },
    },
}));

mock.module('@shared/configs/db', () => ({
    db: {
        insert: (_table: unknown) => ({
            values: (values: unknown) => {
                calls.dbInsertValues.push(values);
                return {
                    returning: async () => values,
                };
            },
        }),
        update: (_table: unknown) => ({
            set: (values: unknown) => {
                calls.dbUpdateSet.push(values);
                return {
                    where: async (_condition: unknown) => {},
                };
            },
        }),
    },
}));

mock.module('@shared/services/video', () => ({
    ffprobe: async (filePath: string) => {
        calls.ffprobe.push(filePath);
        return await ffprobeImpl(filePath);
    },
    VideoJob: class {
        constructor(...args: unknown[]) {
            calls.videoJobConstruct.push(args);
        }

        public addListener(event: string, callback: (...args: unknown[]) => void) {
            calls.videoJobAddListener.push({ event });
            if (event === 'progress') callback({ progress: 50 });
        }

        public async start() {
            calls.videoJobStart.push(true);
            return await jobStartImpl();
        }

        public destroy() {
            calls.videoJobDestroy.push(true);
        }
    },
}));

mock.module('./video.handler', () => ({
    emitVideoProgress: (...args: unknown[]) => {
        calls.emitVideoProgress.push(args);
    },
    handleVideoTask: async () => {},
    handleProcessingError: (...args: unknown[]) => {
        calls.handleProcessingError.push(args);
    },
}));

mock.module('@utils/taskRegistry', () => ({
    taskRegistry: {
        register: (id: string, _job: unknown) => {
            calls.taskRegistryRegister.push({ id });
        },
        unregister: (id: string) => {
            calls.taskRegistryUnregister.push(id);
        },
    },
}));

const taskHandlerModule = await import('@utils/taskHandler');
const addListenerSpy = spyOn(taskHandlerModule.taskHandler, 'addListener').mockImplementation((event: string) => {
    calls.taskHandlerAddListener.push({ event });
});
const handleSpy = spyOn(taskHandlerModule.taskHandler, 'handle').mockImplementation((runnable: Runnable, id?: string) => {
    const resolvedId = id ?? `task-${queuedRunnables.size + 1}`;
    calls.taskHandlerHandle.push({ id: resolvedId });
    queuedRunnables.set(resolvedId, runnable);
    return resolvedId;
});

const { startProcessing, createVideoStorageKey } = await import('./video.processor');

describe('video.processor', () => {
    beforeEach(() => {
        for (const key of Object.keys(calls) as Array<keyof typeof calls>) calls[key].length = 0;
        queuedRunnables.clear();
        uuidCounter = 0;
        accessImpl = async () => {};
        ffprobeImpl = async () => ({
            format: {
                filename: '',
                nb_streams: 1,
                format_name: 'matroska',
                duration: '120',
                size: '1000',
                bit_rate: '1000000',
            },
            streams: [
                {
                    index: 0,
                    codec_name: 'h264',
                    codec_type: 'video',
                    width: 1920,
                    height: 1080,
                    duration: '120',
                    bit_rate: '1000000',
                    tags: {},
                },
            ],
        });
        readdirImpl = async () => ['index.m3u8', 'segment.ts'];
        statImpl = async (filePath: string) => ({ size: filePath.endsWith('.ts') ? 800 : 200 });
        jobStartImpl = async () => true;
        addListenerSpy.mockClear();
        handleSpy.mockClear();
    });

    test('createVideoStorageKey builds expected storage path', () => {
        expect(createVideoStorageKey('video-1', 'version-1', 'index.m3u8')).toBe('videos/video-1/version-1/index.m3u8');
    });

    test('startProcessing inserts waiting tasks and enqueues one runnable per resolution', async () => {
        await startProcessing('video-1', [1080, 720], '/storage', '/storage/original.mkv');

        expect(calls.dbInsertValues).toHaveLength(1);
        expect(calls.dbInsertValues[0]).toEqual([
            {
                id: 'uuid-1',
                videoId: 'video-1',
                width: null,
                height: 1080,
                isOriginal: false,
                storageKey: 'videos/video-1/uuid-1/index.m3u8',
                fileSize: 0,
                mimeType: 'application/x-mpegURL',
                status: 'waiting',
            },
            {
                id: 'uuid-2',
                videoId: 'video-1',
                width: null,
                height: 720,
                isOriginal: false,
                storageKey: 'videos/video-1/uuid-2/index.m3u8',
                fileSize: 0,
                mimeType: 'application/x-mpegURL',
                status: 'waiting',
            },
        ]);
        expect(calls.taskHandlerHandle).toEqual([{ id: 'uuid-1' }, { id: 'uuid-2' }]);
    });

    test('queued task returns 1 and cleans output dir when video job reports unsuccessful stop', async () => {
        jobStartImpl = async () => false;

        await startProcessing('video-1', [1080], '/storage', '/storage/original.mkv');

        const runnable = queuedRunnables.get('uuid-1');
        const result = await runnable?.();

        expect(result).toBe(1);
        expect(calls.videoJobConstruct[0]).toEqual([
            '/storage/original.mkv',
            '/storage/videos/video-1/uuid-1/index.m3u8',
            'copy',
            { height: 1080, isHvec: false, priority: 1, totalDuration: 120 },
        ]);
        expect(calls.taskRegistryRegister).toEqual([{ id: 'uuid-1' }]);
        expect(calls.taskRegistryUnregister).toEqual(['uuid-1']);
        expect(calls.rm).toContainEqual({ path: '/storage/videos/video-1/uuid-1', options: { recursive: true, force: true } });
    });

    test('queued task reports processing error when original file is missing', async () => {
        accessImpl = async () => {
            throw new Error('missing file');
        };

        await startProcessing('video-1', [1080], '/storage', '/storage/original.mkv');

        const runnable = queuedRunnables.get('uuid-1');
        const result = await runnable?.();

        expect(result).toBe(-1);
        expect(calls.handleProcessingError).toEqual([
            ['uuid-1', expect.objectContaining({ message: 'Original video file not found on disk.' }), 'transcode'],
        ]);
        expect(calls.rm).toContainEqual({ path: '/storage/videos/video-1/uuid-1', options: { recursive: true, force: true } });
    });

    test('successful queued task updates version as ready and computes final file size', async () => {
        ffprobeImpl = async () => ({
            format: {
                filename: '',
                nb_streams: 1,
                format_name: 'matroska',
                duration: '90',
                size: '1000',
                bit_rate: '1000000',
            },
            streams: [
                {
                    index: 0,
                    codec_name: 'hevc',
                    codec_type: 'video',
                    width: 3840,
                    height: 2160,
                    duration: '90',
                    bit_rate: '1000000',
                    tags: {},
                },
            ],
        });

        await startProcessing('video-1', [1080], '/storage', '/storage/original.mkv');

        const runnable = queuedRunnables.get('uuid-1');
        const result = await runnable?.();

        expect(result).toBe(0);
        expect(calls.emitVideoProgress).toContainEqual(['video-1', 'processing', { progress: 50 }, 'uuid-1']);
        expect(calls.dbUpdateSet).toEqual([{ status: 'processing' }, { width: 1920, height: 1080, fileSize: 1000, status: 'ready' }]);
        expect(calls.readdir).toEqual(['/storage/videos/video-1/uuid-1']);
        expect(calls.stat).toEqual(['/storage/videos/video-1/uuid-1/index.m3u8', '/storage/videos/video-1/uuid-1/segment.ts']);
    });
});
