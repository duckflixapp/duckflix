import { describe, expect, test } from 'bun:test';
import { sanitizeUploadFileName } from '../upload-temp-file';

describe('upload temp file helpers', () => {
    test('sanitizeUploadFileName removes path traversal and separators', () => {
        expect(sanitizeUploadFileName('../evil/movie.mkv')).toBe('movie.mkv');
        expect(sanitizeUploadFileName('..\\evil\\subtitle.srt')).toBe('subtitle.srt');
    });

    test('sanitizeUploadFileName keeps a usable fallback for unsafe names', () => {
        expect(sanitizeUploadFileName('///')).toBe('upload');
        expect(sanitizeUploadFileName('филм name.mkv')).toBe('_name.mkv');
    });
});
