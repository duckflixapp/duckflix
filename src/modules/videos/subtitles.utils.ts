import fsSync from 'node:fs';
import type { SmallSubtitleData, SubtitleData, SubtitleFile } from '@shared/types/opensubs';

export const mapSubtitles = (subtitles: SubtitleData[], preferences: { lang: string; variants: number }[] = []) => {
    const languageSubtitleMap = new Map<string, SubtitleData[]>();
    subtitles.forEach((sub) => {
        const key = sub.attributes.language;
        const arr = languageSubtitleMap.get(key) ?? [];
        arr.push(sub);
        languageSubtitleMap.set(key, arr);
    });

    const subtitlesArr: SmallSubtitleData[] = [];
    languageSubtitleMap.keys().forEach((key) => {
        const subs = languageSubtitleMap.get(key)!;
        const p = preferences.find((p) => p.lang === key);
        const sliced = subs
            .filter((s) => s.attributes.files.length > 0)
            .sort((a, b) => b.attributes.ratings - a.attributes.ratings)
            .slice(0, p?.variants ?? undefined);
        subtitlesArr.push(
            ...sliced.map((s) => ({
                id: s.id,
                language: s.attributes.language,
                files: s.attributes.files as SubtitleFile[],
                url: s.attributes.url,
            }))
        );
    });

    return subtitlesArr;
};

export const computeHash = async (filePath: string) => {
    const stats = fsSync.statSync(filePath);
    const fileSize = stats.size;

    const bufferSize = 65536;
    const fd = fsSync.openSync(filePath, 'r');

    let hash = BigInt(fileSize);
    const buffer = Buffer.alloc(bufferSize);

    fsSync.readSync(fd, buffer, 0, bufferSize, 0);
    for (let i = 0; i < bufferSize / 8; i++) {
        hash = (hash + buffer.readBigUint64LE(i * 8)) & BigInt('0xFFFFFFFFFFFFFFFF');
    }

    fsSync.readSync(fd, buffer, 0, bufferSize, Math.max(0, fileSize - bufferSize));
    for (let i = 0; i < bufferSize / 8; i++) {
        hash = (hash + buffer.readBigUint64LE(i * 8)) & BigInt('0xFFFFFFFFFFFFFFFF');
    }

    fsSync.closeSync(fd);
    return hash.toString(16).padStart(16, '0');
};
