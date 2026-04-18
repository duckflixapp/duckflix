import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { InvalidVideoFileError } from '../video.errors';

type Metadata = {
    format: {
        duration: string;
        size: string;
        format_name: string;
    };
    streams: Array<{
        codec_type: string;
        width?: number;
        height?: number;
        codec_name?: string;
    }>;
};

const calls = {
    ffprobe: [] as string[],
    unlink: [] as string[],
    mkdir: [] as Array<{ path: string; options?: object }>,
    rename: [] as Array<{ from: string; to: string }>,
    copyFile: [] as Array<{ from: string; to: string }>,
    rm: [] as Array<{ path: string; options?: object }>,
    extractSubtitlesWorkflow: [] as unknown[],
    downloadSubtitlesWorkflow: [] as unknown[],
    notifyJobStatus: [] as unknown[],
    startProcessing: [] as unknown[],
    computeHash: [] as string[],
    loggerErrors: [] as unknown[],
    transactionInsert: [] as unknown[],
    transactionUpdate: [] as unknown[],
};

const defaultMetadata = (): Metadata => ({
    format: {
        duration: '120',
        size: '2048',
        format_name: 'matroska',
    },
    streams: [
        {
            codec_type: 'video',
            width: 1920,
            height: 1080,
            codec_name: 'hevc',
        },
    ],
});

let ffprobeImpl = async (_path: string) => defaultMetadata();
let getStorageStatisticsImpl = async () => ({ availableBytes: 10_000_000 });
let renameImpl = async (_from: string, _to: string) => {};
let copyFileImpl = async (_from: string, _to: string) => {};
let unlinkImpl = async (_path: string) => {};
let mkdirImpl = async (_path: string, _options?: object) => {};
let rmImpl = async (_path: string, _options?: object) => {};
let extractSubtitlesWorkflowImpl = async (_data: unknown) => {};
let downloadSubtitlesWorkflowImpl = async (..._args: unknown[]) => {};
let notifyJobStatusImpl = async (..._args: unknown[]) => {};
let computeHashImpl = async (_path: string) => 'mocked-hash';
let systemSettingsGetImpl = async () => ({ features: { autoTranscoding: 'smart' } });
let startProcessingImpl = async (..._args: unknown[]) => {};
let loggerErrorImpl = (..._args: unknown[]) => {};
let transactionImpl = async (
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
    });

mock.module('node:fs/promises', () => ({
    default: {
        unlink: async (filePath: string) => {
            calls.unlink.push(filePath);
            return unlinkImpl(filePath);
        },
        mkdir: async (dirPath: string, options?: object) => {
            calls.mkdir.push({ path: dirPath, options });
            return mkdirImpl(dirPath, options);
        },
        rename: async (from: string, to: string) => {
            calls.rename.push({ from, to });
            return renameImpl(from, to);
        },
        copyFile: async (from: string, to: string) => {
            calls.copyFile.push({ from, to });
            return copyFileImpl(from, to);
        },
        rm: async (targetPath: string, options?: object) => {
            calls.rm.push({ path: targetPath, options });
            return rmImpl(targetPath, options);
        },
    },
}));

mock.module('@shared/services/video', () => ({
    ffprobe: async (filePath: string) => {
        calls.ffprobe.push(filePath);
        return ffprobeImpl(filePath);
    },
}));

mock.module('@shared/configs/db', () => ({
    db: {
        transaction: async (callback: Parameters<typeof transactionImpl>[0]) => await transactionImpl(callback),
    },
}));

mock.module('@utils/ffmpeg', () => ({
    getMimeTypeFromFormat: (formatName: string) => (formatName.includes('mp4') ? 'video/mp4' : 'video/x-matroska'),
}));

mock.module('../video.processor', () => ({
    createVideoStorageKey: (videoId: string, versionId: string, file: string) => `videos/${videoId}/${versionId}/${file}`,
    startProcessing: (...args: unknown[]) => {
        calls.startProcessing.push(args);
        return startProcessingImpl(...args);
    },
}));

mock.module('@shared/configs/path.config', () => ({
    paths: {
        storage: '/storage',
    },
}));

mock.module('@shared/services/notifications/notification.helper', () => ({
    notifyJobStatus: (...args: unknown[]) => {
        calls.notifyJobStatus.push(args);
        return notifyJobStatusImpl(...args);
    },
}));

mock.module('../subtitles.utils', () => ({
    computeHash: async (filePath: string) => {
        calls.computeHash.push(filePath);
        return computeHashImpl(filePath);
    },
}));

mock.module('@shared/services/system.service', () => ({
    systemSettings: {
        get: async () => await systemSettingsGetImpl(),
    },
}));

mock.module('@shared/configs/logger', () => ({
    logger: {
        error: (...args: unknown[]) => loggerErrorImpl(...args),
    },
}));

mock.module('./subtitles.workflow', () => ({
    extractSubtitlesWorkflow: async (data: unknown) => {
        calls.extractSubtitlesWorkflow.push(data);
        return extractSubtitlesWorkflowImpl(data);
    },
    downloadSubtitlesWorkflow: (...args: unknown[]) => {
        calls.downloadSubtitlesWorkflow.push(args);
        return downloadSubtitlesWorkflowImpl(...args);
    },
}));

mock.module('@shared/services/storage.service', () => ({
    getStorageStatistics: async () => await getStorageStatisticsImpl(),
}));

const { processVideoWorkflow } = await import('./video.workflow');

describe('processVideoWorkflow', () => {
    beforeEach(() => {
        for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
            calls[key].length = 0;
        }

        ffprobeImpl = async () => defaultMetadata();
        getStorageStatisticsImpl = async () => ({ availableBytes: 10_000_000 });
        renameImpl = async () => {};
        copyFileImpl = async () => {};
        unlinkImpl = async () => {};
        mkdirImpl = async () => {};
        rmImpl = async () => {};
        extractSubtitlesWorkflowImpl = async () => {};
        downloadSubtitlesWorkflowImpl = async () => {};
        notifyJobStatusImpl = async () => {};
        computeHashImpl = async () => 'mocked-hash';
        systemSettingsGetImpl = async () => ({ features: { autoTranscoding: 'smart' } });
        startProcessingImpl = async () => {};
        loggerErrorImpl = (...args: unknown[]) => {
            calls.loggerErrors.push(args);
        };
        transactionImpl = async (callback) =>
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
            });
    });

    test('rejects invalid uploaded video and cleans up temp file', async () => {
        ffprobeImpl = async () => {
            throw new Error('ffprobe failed');
        };

        const promise = processVideoWorkflow({
            userId: 'user-1',
            videoId: 'video-1',
            tempPath: '/tmp/upload.mkv',
            originalName: 'upload.mkv',
            fileSize: 123,
            type: 'movie',
            imdbId: null,
        });

        await expect(promise).rejects.toBeInstanceOf(InvalidVideoFileError);
        expect(calls.unlink).toContain('/tmp/upload.mkv');
    });

    test('fails when there is not enough storage and removes temp file', async () => {
        getStorageStatisticsImpl = async () => ({ availableBytes: 100 });

        const promise = processVideoWorkflow({
            userId: 'user-1',
            videoId: 'video-1',
            tempPath: '/tmp/upload.mkv',
            originalName: 'upload.mkv',
            fileSize: 2_000,
            type: 'movie',
            imdbId: null,
        });

        await expect(promise).rejects.toMatchObject({ statusCode: 507, message: 'There is not enough space in storage' });
        expect(calls.unlink).toContain('/tmp/upload.mkv');
    });

    test('falls back to copy when rename crosses devices and starts background processing for smart transcoding', async () => {
        renameImpl = async () => {
            const error = new Error('cross-device') as Error & { code?: string };
            error.code = 'EXDEV';
            throw error;
        };

        await processVideoWorkflow({
            userId: 'user-1',
            videoId: 'video-1',
            tempPath: '/tmp/upload.mkv',
            originalName: 'movie.mkv',
            fileSize: 4_096,
            type: 'movie',
            imdbId: 'tt1234567',
        });

        expect(calls.rename).toHaveLength(1);
        expect(calls.copyFile).toHaveLength(1);
        expect(calls.copyFile[0]).toMatchObject({ from: '/tmp/upload.mkv' });
        expect(calls.copyFile[0]?.to).toMatch(/^\/storage\/videos\/video-1\/.+\/index\.mkv$/);
        expect(calls.unlink).toContain('/tmp/upload.mkv');
        expect(calls.extractSubtitlesWorkflow).toHaveLength(1);
        expect(calls.computeHash).toHaveLength(1);
        expect(calls.downloadSubtitlesWorkflow).toHaveLength(1);
        expect(calls.startProcessing).toHaveLength(1);
        expect(calls.startProcessing[0]).toEqual([
            'video-1',
            [1080, 720],
            '/storage',
            expect.stringMatching(/^\/storage\/videos\/video-1\/.+\/index\.mkv$/),
        ]);
    });

    test('removes moved file when database save fails', async () => {
        transactionImpl = async () => {
            throw new Error('db failed');
        };

        const promise = processVideoWorkflow({
            userId: 'user-1',
            videoId: 'video-1',
            tempPath: '/tmp/upload.mkv',
            originalName: 'movie.mkv',
            fileSize: 4_096,
            type: 'movie',
            imdbId: null,
        });

        await expect(promise).rejects.toMatchObject({ message: 'Video could not be saved in database' });
        expect(calls.unlink.some((entry) => entry.startsWith('/storage/videos/video-1/'))).toBe(true);
    });

    test('logs subtitle download failures without failing the workflow', async () => {
        downloadSubtitlesWorkflowImpl = async () => {
            throw new Error('subtitle provider down');
        };
        systemSettingsGetImpl = async () => ({ features: { autoTranscoding: 'compatibility' } });

        await expect(
            processVideoWorkflow({
                userId: 'user-1',
                videoId: 'video-1',
                tempPath: '/tmp/upload.mkv',
                originalName: 'movie.mkv',
                fileSize: 4_096,
                type: 'movie',
                imdbId: 'tt1234567',
            })
        ).resolves.toBeUndefined();

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(calls.loggerErrors).toHaveLength(1);
    });
});
