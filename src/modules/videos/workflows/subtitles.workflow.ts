import { paths } from '../../../shared/configs/path.config';
import { systemSettings } from '../../../shared/services/system.service';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { convertSRTtoVTT, extractSubtitleStream } from '../../../shared/utils/ffmpeg';
import { db } from '../../../shared/configs/db';
import { subtitles } from '../../../shared/schema';
import { AppError } from '../../../shared/errors';
import { logger } from '../../../shared/configs/logger';
import type { FFprobeData } from '../../../shared/services/video/src/probe';
import { normalizeLanguage } from '../../../shared/utils/subs';
import { mapSubtitles, subtitlesClient } from '../services/subs.service';
import { SubtitleDownloadError } from '../video.errors';
import type { VideoType } from '@duckflix/shared';

const SUPPORTED_SUB_CODECS = [
    'subrip', // SRT
    'ass', // ASS/SSA
    'ssa',
    'webvtt', // VTT
    'mov_text', // MP4 text
    'text',
];

const SKIP_SUB_CODECS = [
    'hdmv_pgs_subtitle', // Blu-ray image based
    'dvd_subtitle', // DVD VOB sub image based
    'dvb_teletext',
];

export const extractSubtitlesWorkflow = async (data: { filePath: string; videoId: string; metadata: FFprobeData }) => {
    const subStreams = data.metadata.streams.filter((s) => s.codec_type === 'subtitle');

    if (subStreams.length === 0) {
        logger.debug({ videoId: data.videoId }, '[ExtractSubtitlesWorkflow] No subtitles found');
        return;
    }

    const imageBasedSubs = subStreams.filter((s) => SKIP_SUB_CODECS.includes(s.codec_name ?? ''));
    if (imageBasedSubs.length > 0) {
        logger.debug(
            {
                videoId: data.videoId,
                count: imageBasedSubs.length,
            },
            '[ExtractSubtitlesWorkflow] Image-based subtitles skipped'
        );
    }

    const textBasedSubs = subStreams.filter((s) => SUPPORTED_SUB_CODECS.includes(s.codec_name ?? ''));
    logger.debug(
        {
            videId: data.videoId,
            count: textBasedSubs.length,
        },
        '[ExtractSubtitlesWorkflow] Found text based subs'
    );

    for (const stream of textBasedSubs) {
        const language = normalizeLanguage(stream.tags.language);
        if (!language) continue;

        try {
            const storageKey = `subtitles/${randomUUID()}.vtt`;
            const finalPath = path.join(paths.storage, storageKey);
            await fs.mkdir(path.dirname(finalPath), { recursive: true });

            await extractSubtitleStream({
                inputPath: data.filePath,
                outputPath: finalPath,
                streamIndex: stream.index,
                codec: stream.codec_name ?? '',
            });

            const stats = await fs.stat(finalPath);
            // check if not empty
            if (stats.size < 10) {
                await fs.unlink(finalPath).catch(() => {});
                continue;
            }

            await db
                .insert(subtitles)
                .values({ videoId: data.videoId, language: language, externalId: null, storageKey })
                .catch(async (err) => {
                    await fs.unlink(finalPath).catch(() => {});
                    throw new AppError('Database insert failed for subtitle', { cause: err });
                });

            logger.info(
                {
                    videoId: data.videoId,
                    language: language,
                    storageKey,
                },
                '[ExtractSubtitlesWorkflow] Subtitle processed and saved successfully'
            );
        } catch (err) {
            const log = {
                err,
                videoId: data.videoId,
                language: language,
            };
            if (err instanceof AppError) logger.warn(log, `[ExtractSubtitlesWorkflow] ${err.message}`);
            else logger.error(log, 'Critical Error processing subtitle');
        }
    }
};

export const downloadSubtitlesWorkflow = async (data: { videoId: string; type: VideoType; imdbId: string; movieHash?: string }) => {
    const sysSettings = await systemSettings.get();
    const preferences = sysSettings.preferences.subtitles;

    const searchOptions = data.type == 'movie' ? { imdbId: data.imdbId, movieHash: data.movieHash } : {};
    const subtitlesRaw = await subtitlesClient.getSubtitles({
        languages: preferences.map((p) => p.lang),
        ...searchOptions,
    });

    const subtitlesMapped = mapSubtitles(subtitlesRaw, preferences);

    for (const subtitle of subtitlesMapped) {
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
                .values({ videoId: data.videoId, language: subtitle.language, externalId: subtitle.id, storageKey })
                .catch(async (err) => {
                    await fs.unlink(finalPath).catch(() => {});
                    throw new AppError('Database insert failed for subtitle', { cause: err });
                });

            logger.info(
                {
                    videoId: data.videoId,
                    language: subtitle.language,
                    storageKey,
                },
                'Subtitle processed and saved successfully'
            );
        } catch (err) {
            const log = {
                err,
                videoId: data.videoId,
                language: subtitle.language,
                externalId: subtitle.id,
            };
            if (err instanceof AppError) logger.warn(log, `[Subtitle Skip] ${err.message}`);
            else logger.error(log, 'Critical Error processing subtitle');
        }
    }
};
