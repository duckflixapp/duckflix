import type { SubtitleDTO, UserRole, VideoDTO, VideoMinDTO, VideoVersionDTO } from '@duckflix/shared';
import type { Subtitle, Video, VideoVersion } from '../schema';
import { toUserMinDTO } from './user.mapper';
import { env } from '../../env';

const BASE_URL = env.BASE_URL;

export type RichVideo = Video & {
    versions: VideoVersion[];
    uploader: { id: string; name: string; role: UserRole; system: boolean } | null;
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
    uploaderId: video.uploaderId,
    duration: video.duration,
    status: video.status,
    createdAt: video.createdAt,
});

export const toVideoDTO = (video: RichVideo): VideoDTO => ({
    ...toVideoMinDTO(video),
    uploader: video.uploader ? toUserMinDTO(video.uploader) : null,
    versions: video.versions.map(toVideoVersionDTO),
    generatedVersions: null,
    subtitles: video.subtitles.map(toSubtitleDTO),
});

export const toSubtitleDTO = (s: Subtitle): SubtitleDTO => ({
    id: s.id,
    videoId: s.videoId,
    language: s.language,
    subtitleUrl: `${BASE_URL}/media/subtitle/${s.id}`,
    createdAt: s.createdAt,
});
