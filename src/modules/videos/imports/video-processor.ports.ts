import type { VideoType } from '@duckflixapp/shared';
import type { VideoMetadata } from '@shared/services/metadata/metadata.types';

export type RawVideoProcessorSource =
    | {
          sourceType: 'file';
          file: File;
      }
    | {
          sourceType: 'text';
          value: string;
      };

export type PreparedVideoProcessorSource =
    | {
          sourceType: 'file';
          file: File;
          tempPath: string;
      }
    | {
          sourceType: 'text';
          value: string;
      };

export type VideoProcessorIdentifyInput = {
    source: PreparedVideoProcessorSource;
    requestedType: VideoType;
};

export type VideoProcessorStartInput = {
    metadata: VideoMetadata;
    source: PreparedVideoProcessorSource;
};

export type VideoProcessorStartOutput = {
    path: string;
    fileName: string;
    fileSize: number;
};

export type VideoProcessor = {
    id: string;
    builtIn: boolean;
    initialStatus?: 'processing' | 'downloading';
    sourceTypes: readonly RawVideoProcessorSource['sourceType'][];
    validateSource(source: RawVideoProcessorSource): Promise<void> | void;
    identify?(input: VideoProcessorIdentifyInput): Promise<VideoMetadata | null>;
    start(input: VideoProcessorStartInput): Promise<VideoProcessorStartOutput>;
};
