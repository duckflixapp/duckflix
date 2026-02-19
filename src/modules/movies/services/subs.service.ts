import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { OpenSubtitlesClient } from '../../../shared/lib/opensubs';
import type { SmallSubtitleData, SubtitleData, SubtitleFile } from '../../../shared/types/opensubs';
import { db } from '../../../shared/db';
import { subtitles } from '../../../shared/schema';
import { paths } from '../../../shared/configs/path.config';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { convertSRTtoVTT } from '../../../shared/utils/ffmpeg';
import { SubtitleDownloadError } from '../movies.errors';
import { AppError } from '../../../shared/errors';
import { getSystemSettings } from '../../../shared/services/system.service';
import { env } from '../../../env';

const systemSettings = await getSystemSettings();
const subtitlesClient = new OpenSubtitlesClient({
    baseUrl: env.OPENSUBS_URL,
    apiKey: systemSettings.external.openSubtitles.apiKey,
    username: systemSettings.external.openSubtitles.username,
    password: systemSettings.external.openSubtitles.password,
    login: systemSettings.external.openSubtitles.useLogin,
});

export const downloadSubtitles = async (data: { movieId: string; imdbId: string; movieHash?: string }) => {
    const preferences = systemSettings.preferences.subtitles;

    const subs = await subtitlesClient.getSubtitles(data.imdbId, {
        languages: preferences.map((p) => p.lang),
        movieHash: data.movieHash,
    });
    const languageSubtitleMap = new Map<string, SubtitleData[]>();
    subs.forEach((sub) => {
        const key = sub.attributes.language;
        const arr = languageSubtitleMap.get(key) ?? [];
        arr.push(sub);
        languageSubtitleMap.set(key, arr);
    });

    const subtitlesArr: SmallSubtitleData[] = [];
    languageSubtitleMap.keys().forEach((key) => {
        const subs = languageSubtitleMap.get(key)!;
        const sliced = subs
            .filter((s) => s.attributes.files.length > 0)
            .sort((a, b) => b.attributes.ratings - a.attributes.ratings)
            .slice(0, preferences.find((p) => p.lang === key)!.variants);
        subtitlesArr.push(
            ...sliced.map((s) => ({
                id: s.id,
                language: s.attributes.language,
                files: s.attributes.files as SubtitleFile[],
                url: s.attributes.url,
            }))
        );
    });

    for (const subtitle of subtitlesArr) {
        if (subtitle.files.length < 1) continue;
        try {
            const file = subtitle.files[0]!;
            const { link } = await subtitlesClient.downloadSubtitle(file.file_id, { sub_format: 'srt' }).catch((err) => {
                throw new SubtitleDownloadError('OpenSubs link failed', err);
            });

            const storageKey = `subtitles/${randomUUID()}.vtt`;
            const finalPath = path.join(paths.storage, storageKey);
            await fs.mkdir(path.dirname(finalPath), { recursive: true });

            const response = await fetch(link);
            if (!response.ok) throw new SubtitleDownloadError(`Source file fetch failed: ${response.statusText}`);
            await convertSRTtoVTT(response.body, finalPath);

            await db
                .insert(subtitles)
                .values({ movieId: data.movieId, language: subtitle.language, externalId: subtitle.id, storageKey })
                .catch(async (err) => {
                    await fs.unlink(finalPath).catch(() => {});
                    throw new AppError('Database insert failed for subtitle', { cause: err });
                });
        } catch (err) {
            if (err instanceof AppError) console.error(`[Subtitle Skip] ${err.message}`);
            else console.error('Critical Error processing subtitle:', err);
        }
    }
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
