import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { FFprobeData } from '@shared/services/video/src/probe';
import { TorrentDownloadError } from '../video.errors';

const calls = {
    validateTorrentFileSize: [] as unknown[],
    readFile: [] as string[],
    unlink: [] as string[],
    mkdir: [] as Array<{ path: string; options?: object }>,
    rm: [] as Array<{ path: string; options?: object }>,
    rename: [] as Array<{ from: string; to: string }>,
    emitVideoProgress: [] as unknown[],
    notifyJobStatus: [] as unknown[],
    dbUpdateSet: [] as unknown[],
    dbUpdateWhere: [] as unknown[],
    downloadCalls: [] as unknown[],
    waitDownloadCalls: [] as number[],
    destroyCalls: [] as number[],
    addListenerCalls: [] as Array<{ event: string; torrentId: number }>,
    ffprobe: [] as string[],
    extractSubtitlesWorkflow: [] as unknown[],
    downloadSubtitlesWorkflow: [] as unknown[],
    computeHash: [] as string[],
    startProcessing: [] as unknown[],
    loggerErrors: [] as unknown[],
    transactionInsert: [] as unknown[],
    transactionUpdate: [] as unknown[],
};

type MockTorrent = {
    id: number;
    dir: string;
    files: Array<{ name: string; length: number }>;
    addListener: (event: string, callback: (...args: unknown[]) => void) => void;
    waitDownload: () => Promise<void>;
    destroy: () => Promise<void>;
    emitProgress: (payload: unknown) => void;
    emitError: (payload: unknown) => void;
};

let validateTorrentFileSizeImpl = async (_path: string) => true;
let readFileImpl = async (_path: string) => Buffer.from('torrent');
let unlinkImpl = async (_path: string) => {};
let mkdirImpl = async (_path: string, _options?: object) => {};
let rmImpl = async (_path: string, _options?: object) => {};
let renameImpl = async (_from: string, _to: string) => {};
let notifyJobStatusImpl = async (..._args: unknown[]) => {};
let downloadImpl = async (_buffer: Buffer) => createTorrent();
let dbUpdateImpl = async () => {};
let ffprobeImpl = async (_path: string): Promise<FFprobeData> => ({
    format: {
        filename: '',
        nb_streams: 1,
        format_name: 'matroska',
        duration: '120',
        size: '5000',
        bit_rate: '1000000',
    },
    streams: [
        {
            index: 0,
            codec_name: 'hevc',
            codec_type: 'video',
            width: 1920,
            height: 1080,
            duration: '120',
            bit_rate: '1000000',
            tags: {},
        },
    ],
});
let getStorageStatisticsImpl = async () => ({ availableBytes: 10_000_000 });
let extractSubtitlesWorkflowImpl = async (_data: unknown) => {};
let downloadSubtitlesWorkflowImpl = async (..._args: unknown[]) => {};
let computeHashImpl = async (_path: string) => 'mocked-hash';
let systemSettingsGetImpl = async () => ({ features: { autoTranscoding: 'compatibility' } });
let startProcessingImpl = async (..._args: unknown[]) => {};

const createTorrent = (overrides: Partial<MockTorrent> = {}): MockTorrent => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const torrent: MockTorrent = {
        id: 99,
        dir: '/downloads/torrent-dir',
        files: [
            { name: 'sample-small.srt', length: 100 },
            { name: 'sample-video.mkv', length: 5_000 },
        ],
        addListener: (event, callback) => {
            calls.addListenerCalls.push({ event, torrentId: torrent.id });
            listeners.set(event, callback);
        },
        waitDownload: async () => {
            calls.waitDownloadCalls.push(torrent.id);
        },
        destroy: async () => {
            calls.destroyCalls.push(torrent.id);
        },
        emitProgress: (payload) => listeners.get('progress')?.(payload),
        emitError: (payload) => listeners.get('error')?.(payload),
        ...overrides,
    };

    return torrent;
};

mock.module('node:fs/promises', () => ({
    default: {
        readFile: async (filePath: string) => {
            calls.readFile.push(filePath);
            return readFileImpl(filePath);
        },
        unlink: async (filePath: string) => {
            calls.unlink.push(filePath);
            return unlinkImpl(filePath);
        },
        mkdir: async (dirPath: string, options?: object) => {
            calls.mkdir.push({ path: dirPath, options });
            return mkdirImpl(dirPath, options);
        },
        rm: async (targetPath: string, options?: object) => {
            calls.rm.push({ path: targetPath, options });
            return rmImpl(targetPath, options);
        },
        rename: async (from: string, to: string) => {
            calls.rename.push({ from, to });
            return renameImpl(from, to);
        },
    },
}));

mock.module('@shared/configs/path.config', () => ({
    paths: {
        downloads: '/downloads',
        storage: '/storage',
    },
}));

mock.module('@utils/torrent', () => ({
    validateTorrentFileSize: async (torrentPath: string) => {
        calls.validateTorrentFileSize.push(torrentPath);
        return validateTorrentFileSizeImpl(torrentPath);
    },
    TorrentClient: class {
        constructor(_options: unknown) {}

        public async download(buffer: Buffer) {
            calls.downloadCalls.push(buffer);
            return await downloadImpl(buffer);
        }
    },
}));

mock.module('@shared/lib/rqbit', () => ({
    RqbitClient: class {
        constructor(_options: unknown) {}
    },
}));

mock.module('../video.handler', () => ({
    handleWorkflowError: async () => {},
    handleProcessingError: async () => {},
    handleVideoTask: async () => {},
    emitVideoProgress: (...args: unknown[]) => {
        calls.emitVideoProgress.push(args);
    },
}));

mock.module('@shared/services/notifications/notification.helper', () => ({
    notifyJobStatus: (...args: unknown[]) => {
        calls.notifyJobStatus.push(args);
        return notifyJobStatusImpl(...args);
    },
}));

mock.module('@core/env', () => ({
    env: {
        RQBIT_URL: 'http://rqbit.local',
    },
}));

mock.module('@shared/configs/logger', () => ({
    logger: {
        info: () => {},
        debug: () => {},
        error: (...args: unknown[]) => {
            calls.loggerErrors.push(args);
        },
    },
}));

mock.module('@shared/configs/db', () => ({
    db: {
        update: (_table: unknown) => ({
            set: (values: unknown) => {
                calls.dbUpdateSet.push(values);
                return {
                    where: async (condition: unknown) => {
                        calls.dbUpdateWhere.push(condition);
                        return await dbUpdateImpl();
                    },
                };
            },
        }),
        transaction: async (
            callback: (tx: {
                insert: (table: unknown) => { values: (values: unknown) => Promise<void> };
                update: (table: unknown) => { set: (values: unknown) => { where: (_condition: unknown) => Promise<void> } };
            }) => Promise<void>
        ) =>
            await callback({
                insert: (_table) => ({
                    values: async (values) => {
                        calls.transactionInsert.push(values);
                    },
                }),
                update: (_table) => ({
                    set: (values) => ({
                        where: async (_condition) => {
                            calls.transactionUpdate.push(values);
                        },
                    }),
                }),
            }),
    },
}));

mock.module('@shared/services/video', () => ({
    ffprobe: async (filePath: string) => {
        calls.ffprobe.push(filePath);
        return await ffprobeImpl(filePath);
    },
}));

mock.module('@utils/ffmpeg', () => ({
    getMimeTypeFromFormat: (formatName: string) => (formatName.includes('mp4') ? 'video/mp4' : 'video/x-matroska'),
}));

mock.module('@shared/services/storage.service', () => ({
    getStorageStatistics: async () => await getStorageStatisticsImpl(),
}));

mock.module('./subtitles.workflow', () => ({
    extractSubtitlesWorkflow: async (data: unknown) => {
        calls.extractSubtitlesWorkflow.push(data);
        return await extractSubtitlesWorkflowImpl(data);
    },
    downloadSubtitlesWorkflow: (...args: unknown[]) => {
        calls.downloadSubtitlesWorkflow.push(args);
        return downloadSubtitlesWorkflowImpl(...args);
    },
}));

mock.module('../subtitles.utils', () => ({
    computeHash: async (filePath: string) => {
        calls.computeHash.push(filePath);
        return await computeHashImpl(filePath);
    },
}));

mock.module('@shared/services/system.service', () => ({
    systemSettings: {
        get: async () => await systemSettingsGetImpl(),
    },
}));

mock.module('../video.processor', () => ({
    createVideoStorageKey: (videoId: string, versionId: string, file: string) => `videos/${videoId}/${versionId}/${file}`,
    startProcessing: (...args: unknown[]) => {
        calls.startProcessing.push(args);
        return startProcessingImpl(...args);
    },
}));

const { processTorrentFileWorkflow } = await import('./torrent.workflow');

describe('processTorrentFileWorkflow', () => {
    beforeEach(() => {
        for (const key of Object.keys(calls) as Array<keyof typeof calls>) calls[key].length = 0;

        validateTorrentFileSizeImpl = async () => true;
        readFileImpl = async () => Buffer.from('torrent');
        unlinkImpl = async () => {};
        mkdirImpl = async () => {};
        rmImpl = async () => {};
        renameImpl = async () => {};
        notifyJobStatusImpl = async () => {};
        downloadImpl = async () => createTorrent();
        dbUpdateImpl = async () => {};
        ffprobeImpl = async (_path: string) => ({
            format: {
                filename: '',
                nb_streams: 1,
                format_name: 'matroska',
                duration: '120',
                size: '5000',
                bit_rate: '1000000',
            },
            streams: [
                {
                    index: 0,
                    codec_name: 'hevc',
                    codec_type: 'video',
                    width: 1920,
                    height: 1080,
                    duration: '120',
                    bit_rate: '1000000',
                    tags: {},
                },
            ],
        });
        getStorageStatisticsImpl = async () => ({ availableBytes: 10_000_000 });
        extractSubtitlesWorkflowImpl = async () => {};
        downloadSubtitlesWorkflowImpl = async () => {};
        computeHashImpl = async () => 'mocked-hash';
        systemSettingsGetImpl = async () => ({ features: { autoTranscoding: 'compatibility' } });
        startProcessingImpl = async () => {};
    });

    test('rejects oversized torrent and still removes uploaded torrent file', async () => {
        validateTorrentFileSizeImpl = async () => false;

        const promise = processTorrentFileWorkflow({
            userId: 'user-1',
            videoId: 'video-1',
            torrentPath: '/tmp/upload.torrent',
            type: 'movie',
            imdbId: null,
        });

        await expect(promise).rejects.toMatchObject({ statusCode: 400, message: 'Torrent file is too large' });
        expect(calls.unlink).toContain('/tmp/upload.torrent');
        expect(calls.downloadCalls).toHaveLength(0);
    });

    test('wraps download failure and creates downloads directory first', async () => {
        downloadImpl = async () => {
            throw new Error('no peers');
        };

        const promise = processTorrentFileWorkflow({
            userId: 'user-1',
            videoId: 'video-1',
            torrentPath: '/tmp/upload.torrent',
            type: 'movie',
            imdbId: null,
        });

        await expect(promise).rejects.toBeInstanceOf(TorrentDownloadError);
        expect(calls.mkdir).toEqual([{ path: '/downloads', options: { recursive: true } }]);
        expect(calls.unlink).toContain('/tmp/upload.torrent');
    });

    test('cleans torrent directory and destroys torrent when status update fails after download', async () => {
        const torrent = createTorrent();
        downloadImpl = async () => torrent;
        dbUpdateImpl = async () => {
            throw new Error('db failed');
        };

        const promise = processTorrentFileWorkflow({
            userId: 'user-1',
            videoId: 'video-1',
            torrentPath: '/tmp/upload.torrent',
            type: 'movie',
            imdbId: null,
        });

        await expect(promise).rejects.toMatchObject({ message: 'Error changing video status and notifying' });
        expect(calls.rm).toContainEqual({ path: '/downloads/torrent-dir', options: { recursive: true, force: true } });
        expect(calls.destroyCalls).toContain(99);
        expect(calls.ffprobe).toHaveLength(0);
    });

    test('renames the largest downloaded file and hands off into the real video workflow', async () => {
        const torrent = createTorrent();
        downloadImpl = async () => torrent;

        await processTorrentFileWorkflow({
            userId: 'user-1',
            videoId: 'video-1',
            torrentPath: '/tmp/upload.torrent',
            type: 'movie',
            imdbId: 'tt1234567',
        });

        expect(calls.notifyJobStatus).toEqual([
            ['user-1', 'started', 'Video started downloading', 'video-1', 'video-1'],
            ['user-1', 'downloaded', 'Video downloaded', 'Video download completed. Processing...', 'video-1'],
            ['user-1', 'completed', 'Upload completed', 'Video uploaded successfully', 'video-1'],
        ]);
        expect(calls.rename).toContainEqual({
            from: '/downloads/torrent-dir/sample-video.mkv',
            to: '/downloads/video-1-torrent.mkv',
        });
        expect(calls.rm).toContainEqual({ path: '/downloads/torrent-dir', options: { recursive: true, force: true } });
        expect(calls.destroyCalls).toContain(99);
        expect(calls.ffprobe).toContain('/downloads/video-1-torrent.mkv');
        expect(calls.extractSubtitlesWorkflow).toHaveLength(1);
        expect(calls.computeHash.some((filePath) => filePath.startsWith('/storage/videos/video-1/'))).toBe(true);
        expect(calls.downloadSubtitlesWorkflow).toHaveLength(1);
    });

    test('emits progress updates from torrent listener', async () => {
        const torrent = createTorrent({
            waitDownload: async () => {
                calls.waitDownloadCalls.push(99);
                torrent.emitProgress({ percent: 42 });
            },
        });
        downloadImpl = async () => torrent;

        await processTorrentFileWorkflow({
            userId: 'user-1',
            videoId: 'video-1',
            torrentPath: '/tmp/upload.torrent',
            type: 'movie',
            imdbId: null,
        });

        expect(calls.emitVideoProgress).toContainEqual(['video-1', 'downloading', { percent: 42 }]);
    });
});
