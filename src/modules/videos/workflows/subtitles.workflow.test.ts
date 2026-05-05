import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { FFprobeData } from '@shared/services/video/src/probe';

const calls = {
    mkdir: [] as Array<{ path: string; options?: object }>,
    stat: [] as string[],
    unlink: [] as string[],
    extractSubtitleStream: [] as unknown[],
    convertSRTtoVTT: [] as unknown[],
    getSubtitles: [] as unknown[],
    downloadSubtitle: [] as unknown[],
    dbInsertValues: [] as unknown[],
    dbWhereCalls: [] as unknown[],
    warnings: [] as unknown[],
    errors: [] as unknown[],
    infos: [] as unknown[],
    fetch: [] as string[],
};

let statImpl = async (_path: string) => ({ size: 100 });
let extractSubtitleStreamImpl = async (_opts: unknown) => {};
let convertSRTtoVTTImpl = async (_stream: ReadableStream | null, _outputPath: string) => {};
let getSubtitlesImpl = async (_opts: unknown) =>
    [] as Array<{
        id: string;
        language: string;
        files: Array<{ file_id: number }>;
        url?: string;
    }>;
let downloadSubtitleImpl = async (_fileId: number, _opts?: unknown) => ({ link: 'https://example.com/sub.srt' });
let fetchImpl = async (_url: string) => new Response('1\n00:00:00,000 --> 00:00:01,000\nHello', { status: 200 });
let insertShouldFail = false;

mock.module('node:crypto', () => ({
    randomUUID: () => 'subtitle-uuid',
}));

mock.module('node:fs/promises', () => ({
    default: {
        mkdir: async (dirPath: string, options?: object) => {
            calls.mkdir.push({ path: dirPath, options });
        },
        stat: async (filePath: string) => {
            calls.stat.push(filePath);
            return await statImpl(filePath);
        },
        unlink: async (filePath: string) => {
            calls.unlink.push(filePath);
        },
        rm: async () => {},
    },
}));

mock.module('@shared/configs/path.config', () => ({
    paths: {
        storage: '/storage',
    },
}));

mock.module('@utils/ffmpeg', () => ({
    extractSubtitleStream: async (opts: unknown) => {
        calls.extractSubtitleStream.push(opts);
        return await extractSubtitleStreamImpl(opts);
    },
    convertSRTtoVTT: async (stream: ReadableStream | null, outputPath: string) => {
        calls.convertSRTtoVTT.push({ stream, outputPath });
        return await convertSRTtoVTTImpl(stream, outputPath);
    },
}));

mock.module('@shared/configs/db', () => ({
    db: {
        transaction: async (
            callback: (tx: {
                select: (_shape: unknown) => {
                    from: (_table: unknown) => { where: (_condition: unknown) => Promise<Array<{ language: string; name: string }>> };
                };
                insert: (_table: unknown) => { values: (values: unknown) => Promise<void> };
            }) => Promise<void>
        ) =>
            await callback({
                select: (_shape) => ({
                    from: (_table) => ({
                        where: async (condition) => {
                            calls.dbWhereCalls.push(condition);
                            return [{ language: 'en', name: 'English' }];
                        },
                    }),
                }),
                insert: (_table) => ({
                    values: async (values) => {
                        calls.dbInsertValues.push(values);
                        if (insertShouldFail) throw new Error('db failed');
                    },
                }),
            }),
    },
}));

mock.module('@utils/subs', () => ({
    normalizeLanguage: (lang: string | undefined) => (lang === 'eng' ? 'en' : lang === 'srp' ? 'sr' : null),
    createSubtitleName: (lang: string) => (lang === 'en' ? 'English 2' : 'Serbian'),
}));

mock.module('../subtitles.utils', () => ({
    mapSubtitles: (subtitlesRaw: unknown) => subtitlesRaw,
}));

mock.module('@shared/services/system.service', () => ({
    systemSettings: {
        get: async () => ({
            preferences: {
                subtitles: [
                    { lang: 'en', variants: 1 },
                    { lang: 'sr', variants: 1 },
                ],
            },
        }),
    },
}));

mock.module('@shared/lib/opensubs', () => ({
    subtitlesClient: {
        getSubtitles: async (opts: unknown) => {
            calls.getSubtitles.push(opts);
            return await getSubtitlesImpl(opts);
        },
        downloadSubtitle: async (fileId: number, opts?: unknown) => {
            calls.downloadSubtitle.push({ fileId, opts });
            return await downloadSubtitleImpl(fileId, opts);
        },
    },
}));

mock.module('@shared/configs/logger', () => ({
    logger: {
        debug: () => {},
        info: (...args: unknown[]) => calls.infos.push(args),
        warn: (...args: unknown[]) => calls.warnings.push(args),
        error: (...args: unknown[]) => calls.errors.push(args),
    },
}));

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.fetch.push(url);
    return await fetchImpl(url);
}) as typeof fetch;

const { extractSubtitlesWorkflow, downloadSubtitlesWorkflow } = await import(
    new URL('./subtitles.workflow.ts?subtitles-workflow-test', import.meta.url).href
);

const metadataWithSubtitles = (): FFprobeData => ({
    format: {
        filename: '',
        nb_streams: 2,
        format_name: 'matroska',
        duration: '120',
        size: '1000',
        bit_rate: '1000000',
    },
    streams: [
        { index: 0, codec_name: 'h264', codec_type: 'video', width: 1920, height: 1080, duration: '120', bit_rate: '1000000', tags: {} },
        { index: 2, codec_name: 'subrip', codec_type: 'subtitle', tags: { language: 'eng' } },
    ],
});

describe('subtitles.workflow', () => {
    beforeEach(() => {
        for (const key of Object.keys(calls) as Array<keyof typeof calls>) calls[key].length = 0;
        statImpl = async () => ({ size: 100 });
        extractSubtitleStreamImpl = async () => {};
        convertSRTtoVTTImpl = async () => {};
        getSubtitlesImpl = async (_opts) => [];
        downloadSubtitleImpl = async () => ({ link: 'https://example.com/sub.srt' });
        fetchImpl = async () => new Response('1\n00:00:00,000 --> 00:00:01,000\nHello', { status: 200 });
        insertShouldFail = false;
    });

    test('extractSubtitlesWorkflow skips empty extracted subtitle files', async () => {
        statImpl = async () => ({ size: 5 });

        await extractSubtitlesWorkflow({
            filePath: '/storage/video.mkv',
            videoId: 'video-1',
            metadata: metadataWithSubtitles(),
        });

        expect(calls.extractSubtitleStream).toHaveLength(1);
        expect(calls.unlink).toContain('/storage/subtitles/subtitle-uuid.vtt');
        expect(calls.dbInsertValues).toHaveLength(0);
    });

    test('extractSubtitlesWorkflow removes subtitle file and warns when db insert fails', async () => {
        insertShouldFail = true;

        await extractSubtitlesWorkflow({
            filePath: '/storage/video.mkv',
            videoId: 'video-1',
            metadata: metadataWithSubtitles(),
        });

        expect(calls.dbInsertValues).toEqual([
            { videoId: 'video-1', name: 'English 2', language: 'en', externalId: null, storageKey: 'subtitles/subtitle-uuid.vtt' },
        ]);
        expect(calls.unlink).toContain('/storage/subtitles/subtitle-uuid.vtt');
        expect(calls.warnings).toHaveLength(1);
    });

    test('downloadSubtitlesWorkflow downloads, converts and saves subtitle', async () => {
        getSubtitlesImpl = async (_opts) => [
            {
                id: 'sub-1',
                language: 'en',
                files: [{ file_id: 77 }],
            },
        ];

        await downloadSubtitlesWorkflow({
            videoId: 'video-1',
            type: 'movie',
            imdbId: 'tt1234567',
            movieHash: 'hash-1',
        });

        expect(calls.getSubtitles).toEqual([{ type: 'movie', languages: ['en', 'sr'], imdbId: 'tt1234567', movieHash: 'hash-1' }]);
        expect(calls.downloadSubtitle).toEqual([{ fileId: 77, opts: { sub_format: 'srt' } }]);
        expect(calls.fetch).toEqual(['https://example.com/sub.srt']);
        expect(calls.convertSRTtoVTT).toHaveLength(1);
        expect(calls.dbInsertValues).toEqual([
            { videoId: 'video-1', name: 'English 2', language: 'en', externalId: '77', storageKey: 'subtitles/subtitle-uuid.vtt' },
        ]);
    });

    test('downloadSubtitlesWorkflow logs and skips failed subtitle downloads', async () => {
        getSubtitlesImpl = async (_opts) => [
            {
                id: 'sub-1',
                language: 'en',
                files: [{ file_id: 77 }],
            },
        ];
        fetchImpl = async () => new Response('boom', { status: 500, statusText: 'Server Error' });

        await downloadSubtitlesWorkflow({
            videoId: 'video-1',
            type: 'movie',
            imdbId: 'tt1234567',
            movieHash: 'hash-1',
        });

        expect(calls.dbInsertValues).toHaveLength(0);
        expect(calls.warnings).toHaveLength(1);
    });
});

afterAll(() => {
    globalThis.fetch = originalFetch;
});
