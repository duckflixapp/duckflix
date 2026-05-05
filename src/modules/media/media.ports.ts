import type { Subtitle, Video, VideoVersion } from '@schema/video.schema';
import type { SessionData } from './session/session.repository';

export type VideoWithVersions = Video & { versions: VideoVersion[] };

export type MediaFile = ReturnType<typeof Bun.file>;

export interface MediaRepository {
    findVideoWithVersions(videoId: string): Promise<VideoWithVersions | null>;
    findVideoVersion(versionId: string): Promise<VideoVersion | null>;
    findSubtitle(subtitleId: string): Promise<Subtitle | null>;
}

export interface MediaSessionClient {
    create(data: Omit<SessionData, 'expiresAt'>): Promise<string>;
    validate(id: string, videoId: string): Promise<{ id: string; data: SessionData }>;
}

export interface MediaFileStore {
    file(filePath: string): MediaFile;
}

export interface MediaPaths {
    storage: string;
    live: string;
}

export interface LiveSessionTask {
    initalize(): Promise<void>;
    prepareSegment(segment: number, options: { height: number }): Promise<void>;
    destroy(): void;
}

export type LiveSessionTaskFactory = (
    session: string,
    sourcePath: string,
    outputPath: string,
    segmentDuration: number,
    height: number,
    totalSegments: number,
    onCleanup: () => Promise<void>
) => LiveSessionTask | Promise<LiveSessionTask>;
