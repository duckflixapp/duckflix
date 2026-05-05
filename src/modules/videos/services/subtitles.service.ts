import { AppError } from '@shared/errors';
import fs from 'fs/promises';
import path from 'path';
import { paths } from '@shared/configs/path.config';
import { SubtitleDownloadError, VideoNotFoundError } from '../video.errors';
import { randomUUID } from 'crypto';
import { convertSRTtoVTT } from '@shared/utils/ffmpeg';
import { toSubtitleDTO, toSubtitleSearchResultDTO } from '@shared/mappers/video.mapper';
import { ffprobe } from '@shared/services/video';
import ISO6391 from 'iso-639-1';
import type { SubtitleSearchResultDTO } from '@duckflixapp/shared';
import { createSubtitleName } from '@shared/utils/subs';
import { subtitlesClient } from '@shared/lib/opensubs';
import { drizzleVideoSubtitlesRepository } from '../videos.drizzle.repository';
import type { VideoSubtitlesRepository } from '../videos.ports';

const ALLOWED_FORMATS = ['srt', 'webvtt'];
const ALLOWED_FORMATS_STRING = ALLOWED_FORMATS.join(',');

type VideoSubtitlesServiceDependencies = {
    videoSubtitlesRepository: VideoSubtitlesRepository;
};

export const createVideoSubtitlesService = ({ videoSubtitlesRepository }: VideoSubtitlesServiceDependencies) => {
    const saveSubtitle = async (data: { videoId: string; tempPath: string; originalName: string; language: string }) => {
        if (!ISO6391.validate(data.language)) throw new AppError('Language code must be in ISO-639-1 standard.', { statusCode: 400 });

        const storageKey = `subtitles/${randomUUID()}.vtt`;
        const finalPath = path.join(paths.storage, storageKey);

        const metadata = await ffprobe(data.tempPath).catch(async () => {
            throw new AppError('Invalid subtitle file', { statusCode: 400 });
        });

        const formatName = metadata.format.format_name;

        if (!ALLOWED_FORMATS.includes(formatName))
            throw new AppError('Invalid subtitle format. Allowed formats: ' + ALLOWED_FORMATS_STRING, { statusCode: 400 });

        try {
            const videoExists = await videoSubtitlesRepository.videoExists(data.videoId);
            if (!videoExists) throw new VideoNotFoundError();
            await fs.mkdir(path.dirname(finalPath), { recursive: true });

            if (formatName === 'webvtt') {
                await fs.rename(data.tempPath, finalPath).catch(async (e) => {
                    if (e.code !== 'EXDEV') throw e;
                    await fs.copyFile(data.tempPath, finalPath);
                    await fs.unlink(data.tempPath).catch(() => {});
                });
            } else if (formatName === 'srt') {
                const stream = (await fs.open(data.tempPath)).readableWebStream();
                await convertSRTtoVTT(stream, finalPath);
                await fs.unlink(data.tempPath).catch(() => {});
            }

            const subs = await videoSubtitlesRepository.listSubtitleNames(data.videoId);
            const name = createSubtitleName(data.language, subs);

            const sub = await videoSubtitlesRepository.insertSubtitle({
                videoId: data.videoId,
                name,
                language: data.language,
                externalId: null,
                storageKey,
            });
            if (!sub) throw new AppError('Failed inserting subtitle');

            return toSubtitleDTO(sub);
        } catch (e) {
            await fs.unlink(data.tempPath).catch(() => {});
            await fs.unlink(finalPath).catch(() => {});
            if (e instanceof AppError) throw e;
            throw new AppError('Saving subtitle failed', { cause: e });
        }
    };

    const searchOpenSubtitles = async (data: { videoId: string; language: string }) => {
        if (!ISO6391.validate(data.language)) throw new AppError('Language code must be in ISO-639-1 standard.', { statusCode: 400 });

        const video = await videoSubtitlesRepository.findVideoForSearch(data.videoId);
        if (!video) throw new VideoNotFoundError();

        const subtitlesRaw = await subtitlesClient.getSubtitles({
            type: video.type,
            languages: [data.language],
            tmdbId: (video.movie?.tmdbId || video.episode?.tmdbId) ?? undefined,
        });

        const subtitles = subtitlesRaw.map(toSubtitleSearchResultDTO).filter((subtitle) => !!subtitle) satisfies SubtitleSearchResultDTO[];

        return subtitles;
    };

    const importOpenSubtitles = async (data: { videoId: string; fileId: number }) => {
        const video = await videoSubtitlesRepository.findVideoForSearch(data.videoId);
        if (!video) throw new VideoNotFoundError();

        const results = await subtitlesClient.getSubtitles({ fileId: data.fileId });
        if (results.length !== 1) throw new AppError('Subtitle not found', { statusCode: 404 });

        const subtitle = results[0]!;

        const { link } = await subtitlesClient.downloadSubtitle(data.fileId, { sub_format: 'srt' }).catch((err) => {
            throw new SubtitleDownloadError('OpenSubs link failed', err);
        });

        const storageKey = `subtitles/${randomUUID()}.vtt`;
        const finalPath = path.join(paths.storage, storageKey);
        await fs.mkdir(path.dirname(finalPath), { recursive: true });

        try {
            const response = await fetch(link);
            if (!response.ok) throw new SubtitleDownloadError(`Source file fetch failed: ${response.statusText}`);
            await convertSRTtoVTT(response.body, finalPath);

            const externalId = String(data.fileId);
            const subs = await videoSubtitlesRepository.listSubtitleNames(data.videoId);
            const name = createSubtitleName(subtitle.attributes.language, subs);

            const insertedSubtitle = await videoSubtitlesRepository
                .insertSubtitleWithDuplicateCheck({
                    videoId: data.videoId,
                    name,
                    language: subtitle.attributes.language,
                    externalId,
                    storageKey,
                })
                .catch(async (err) => {
                    await fs.unlink(finalPath).catch(() => {});
                    throw new AppError('Database insert failed for subtitle', { cause: err });
                });

            if (insertedSubtitle === 'duplicate') throw new AppError('Subtitle is already uploaded for this video');
            if (!insertedSubtitle) throw new AppError('Failed to insert subtitle');

            return toSubtitleDTO(insertedSubtitle);
        } catch (e) {
            await fs.unlink(finalPath).catch(() => {});
            if (e instanceof AppError) throw e;
            throw new AppError('Saving subtitle failed', { cause: e });
        }
    };

    const deleteSubtitleById = async (data: { videoId: string; subtitleId: string }) => {
        const subtitle = await videoSubtitlesRepository.findSubtitle(data);
        if (!subtitle) throw new AppError('Subtitle not found', { statusCode: 404 });

        await videoSubtitlesRepository.deleteSubtitleById(data.subtitleId);

        const finalPath = path.join(paths.storage, subtitle.storageKey);
        await fs.unlink(finalPath).catch(() => {});
    };

    return {
        saveSubtitle,
        searchOpenSubtitles,
        importOpenSubtitles,
        deleteSubtitleById,
    };
};

export type VideoSubtitlesService = ReturnType<typeof createVideoSubtitlesService>;

export const videoSubtitlesService = createVideoSubtitlesService({
    videoSubtitlesRepository: drizzleVideoSubtitlesRepository,
});

export const saveSubtitle = videoSubtitlesService.saveSubtitle;
export const searchOpenSubtitles = videoSubtitlesService.searchOpenSubtitles;
export const importOpenSubtitles = videoSubtitlesService.importOpenSubtitles;
export const deleteSubtitleById = videoSubtitlesService.deleteSubtitleById;
