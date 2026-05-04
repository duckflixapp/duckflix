import { describe, expect, test } from 'bun:test';
import { AppError } from '@shared/errors';
import { appendSessionToHlsManifest, resolveMediaStoragePath } from '@modules/media/media.helpers';

describe('media helpers', () => {
    test('appendSessionToHlsManifest adds the session to playable manifest entries', () => {
        const manifest = `#EXTM3U
#EXT-X-VERSION:3
seg-0.ts
variant/index.m3u8?token=abc
subtitles.vtt
#EXT-X-ENDLIST`;

        expect(appendSessionToHlsManifest(manifest, 'session-1')).toBe(`#EXTM3U
#EXT-X-VERSION:3
seg-0.ts?session=session-1
variant/index.m3u8?token=abc&session=session-1
subtitles.vtt?session=session-1
#EXT-X-ENDLIST`);
    });

    test('resolveMediaStoragePath resolves files next to the stored media object', () => {
        expect(resolveMediaStoragePath('/storage', 'videos/video-1/index.m3u8', 'seg-0.ts')).toBe('/storage/videos/video-1/seg-0.ts');
    });

    test('resolveMediaStoragePath rejects traversal attempts', () => {
        expect(() => resolveMediaStoragePath('/storage', 'videos/video-1/index.m3u8', '../secret.ts')).toThrow(AppError);
        expect(() => resolveMediaStoragePath('/storage', 'videos/video-1/index.m3u8', '/secret.ts')).toThrow(AppError);
    });
});
