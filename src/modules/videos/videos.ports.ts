import type { SubtitleSearchResultDTO } from '@duckflixapp/shared';
import type { RichVideo } from '@shared/mappers/video.mapper';
import type { EpisodeMetadata, MovieMetadata, VideoMetadata } from '@shared/services/metadata/metadata.types';
import type { Subtitle, Video, VideoVersion, WatchHistory } from '@shared/schema';

export type VideoUploadStatus = 'downloading' | 'processing';

export type VideoDeleteRecord = Video & {
    versions: VideoVersion[];
    subtitles: { id: string; storageKey: string }[];
    movie: { id: string; title: string } | null;
    episode: { id: string; name: string } | null;
};

export type VideoResolveRecord = Pick<Video, 'id' | 'type'> & {
    movie: { id: string; title: string } | null;
    episode: { id: string; name: string } | null;
};

export type VideoProgressRecord = {
    id: string;
    history: WatchHistory | null;
};

export type VideoSubtitleSourceRecord = Pick<Video, 'id' | 'type'> & {
    movie: { tmdbId: number | null } | null;
    episode: { tmdbId: number | null } | null;
};

export type SubtitleNameRecord = Pick<Subtitle, 'language' | 'name'> & Partial<Pick<Subtitle, 'externalId'>>;

export interface VideosRepository {
    initiateUpload(metadata: VideoMetadata, data: { accountId: string; status: VideoUploadStatus }): Promise<Video>;
    findById(videoId: string): Promise<RichVideo | null>;
    findStatus(videoId: string): Promise<Pick<Video, 'id' | 'status'> | null>;
    findForDelete(videoId: string): Promise<VideoDeleteRecord | null>;
    deleteById(videoId: string): Promise<void>;
    findProgress(data: { videoId: string; profileId: string }): Promise<VideoProgressRecord | null>;
    findDuration(videoId: string): Promise<Pick<Video, 'id' | 'duration'> | null>;
    findExistingProgress(data: { videoId: string; profileId: string }): Promise<WatchHistory | null>;
    upsertProgress(data: {
        videoId: string;
        profileId: string;
        positionSec: number;
        isFinished: boolean;
        updatedAt: string;
    }): Promise<WatchHistory | null>;
    findForResolve(videoId: string): Promise<VideoResolveRecord | null>;
}

export interface VideoVersionsRepository {
    listByVideoId(videoId: string): Promise<VideoVersion[] | null>;
    findVideoWithReadyOriginal(videoId: string): Promise<(Video & { versions: VideoVersion[] }) | null>;
    findExistingHlsVersion(data: { videoId: string; height: number }): Promise<VideoVersion | null>;
    findById(data: { videoId: string; versionId: string }): Promise<VideoVersion | null>;
    deleteById(versionId: string): Promise<void>;
}

export interface VideoSubtitlesRepository {
    videoExists(videoId: string): Promise<boolean>;
    findVideoForSearch(videoId: string): Promise<VideoSubtitleSourceRecord | null>;
    listSubtitleNames(videoId: string): Promise<SubtitleNameRecord[]>;
    insertSubtitle(data: {
        videoId: string;
        name: string;
        language: string;
        externalId: string | null;
        storageKey: string;
    }): Promise<Subtitle | null>;
    insertSubtitleWithDuplicateCheck(data: {
        videoId: string;
        name: string;
        language: string;
        externalId: string;
        storageKey: string;
    }): Promise<Subtitle | 'duplicate' | null>;
    findSubtitle(data: { videoId: string; subtitleId: string }): Promise<Subtitle | null>;
    deleteSubtitleById(subtitleId: string): Promise<void>;
}

export interface ExternalSubtitleClient {
    getSubtitles(options: unknown): Promise<unknown[]>;
    downloadSubtitle(fileId: number, options: { sub_format: 'srt' }): Promise<{ link: string }>;
}

export interface VideoMetadataPersistence {
    createMovie(tx: unknown, video: Video, data: MovieMetadata): Promise<void>;
    createEpisode(tx: unknown, video: Video, data: EpisodeMetadata): Promise<void>;
}

export interface SubtitleSearchMapper {
    map(raw: unknown): SubtitleSearchResultDTO | null;
}
