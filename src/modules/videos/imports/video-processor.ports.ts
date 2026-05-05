import type { DownloadProgress, JobProgress, VideoType } from '@duckflixapp/shared';
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

export type VideoProcessorEvent =
    | {
          type: 'progress';
          phase: 'downloading' | 'processing';
          progress: JobProgress | DownloadProgress | undefined;
      }
    | {
          type: 'status';
          status: 'started' | 'downloaded' | 'completed' | 'canceled' | 'error';
          title: string;
          message: string;
      }
    | {
          type: 'log';
          level: 'debug' | 'info' | 'warn' | 'error';
          message: string;
          data?: Record<string, unknown>;
      };

type CancellableDownload = {
    cancel(): Promise<void> | void;
};

export type VideoProcessorContext = {
    emit(event: VideoProcessorEvent): Promise<void> | void;
    download: {
        register: (process: CancellableDownload) => unknown;
        unregister: () => unknown;
    };
    signal?: AbortSignal;
};

export type VideoProcessor = {
    id: string;
    builtIn: boolean;
    initialStatus?: 'processing' | 'downloading';
    sourceTypes: readonly RawVideoProcessorSource['sourceType'][];
    validateSource(source: RawVideoProcessorSource): Promise<void> | void;
    identify?(input: VideoProcessorIdentifyInput): Promise<VideoMetadata | null>;
    start(input: VideoProcessorStartInput, context: VideoProcessorContext): Promise<VideoProcessorStartOutput>;
};

export class DownloadCancelledError extends Error {
    constructor() {
        super('cancelled-download');
        this.name = 'DownloadCancelledError';
    }
}
