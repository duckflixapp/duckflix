import type { VideoDTO, VideoMinDTO, WatchHistoryDTO, SubtitleDTO, SubtitleSearchResultDTO, VideoVersionDTO } from '@duckflixapp/shared';
import type { Subtitle, Video, VideoVersion, WatchHistory } from '@schema/video.schema';
import { toAccountRefDTO } from './user.mapper';
import { env } from '@core/env';
import type { SubtitleData } from '@shared/types/opensubs';
import type { AccountRefSource } from './user.mapper';

const BASE_URL = env.BASE_URL;

export type RichVideo = Video & {
    versions: VideoVersion[];
    uploader: AccountRefSource | null;
    subtitles: Subtitle[];
};

export const toVideoVersionDTO = (v: VideoVersion): VideoVersionDTO => ({
    id: v.id,
    height: v.height,
    width: v.width,
    status: v.status,
    fileSize: v.fileSize,
    mimeType: v.mimeType,
    streamUrl: `${BASE_URL}/media/stream/${v.id}/`,
    isOriginal: v.isOriginal,
});

export const toVideoMinDTO = (video: Video): VideoMinDTO => ({
    id: video.id,
    type: video.type,
    accountId: video.uploaderId,
    duration: video.duration,
    status: video.status,
    createdAt: video.createdAt,
});

export const toVideoDTO = (video: RichVideo): VideoDTO => ({
    ...toVideoMinDTO(video),
    user: video.uploader ? toAccountRefDTO(video.uploader) : null,
    versions: video.versions.map(toVideoVersionDTO),
    generatedVersions: null,
    subtitles: video.subtitles.map(toSubtitleDTO),
});

export const toSubtitleDTO = (s: Subtitle): SubtitleDTO => ({
    id: s.id,
    videoId: s.videoId,
    name: s.name ?? null,
    language: s.language,
    externalId: s.externalId,
    subtitleUrl: `${BASE_URL}/media/subtitles/${s.id}`,
    createdAt: s.createdAt,
});

export const toSubtitleSearchResultDTO = (s: SubtitleData): SubtitleSearchResultDTO | null => {
    const file = s.attributes.files[0];
    if (!file) return null;
    return {
        fileId: file.file_id,
        fileName: file.file_name,
        release: s.attributes.release,
        language: s.attributes.language,
        downloads: s.attributes.download_count,
        hearingImpaired: s.attributes.hearing_impaired,
        aiTranslated: s.attributes.ai_translated,
        trusted: s.attributes.from_trusted,
        fps: s.attributes.fps,
    };
};

export const toWatchHistoryDTO = (w: WatchHistory): WatchHistoryDTO => ({
    id: w.id,
    profileId: w.profileId,
    videoId: w.videoId,
    lastPosition: w.lastPosition,
    isFinished: w.isFinished,
    updatedAt: w.updatedAt,
});
