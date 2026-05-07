import type { VideoMetadata } from '@shared/services/metadata/metadata.types';
import type { AddonPermission, AddonPrepareContext } from '@modules/addons/addons.ports';
import type {
    RawVideoProcessorSource,
    VideoProcessorContext,
    VideoProcessorIdentifyInput,
    VideoProcessorScanInput,
    VideoProcessorScanItem,
    VideoProcessorStartInput,
    VideoProcessorStartOutput,
} from '@duckflixapp/addon-sdk/types';

export type VideoProcessor = {
    id: string;
    builtIn: boolean;
    initialStatus?: 'processing' | 'downloading';
    permissions?: readonly AddonPermission[];
    sourceTypes: readonly RawVideoProcessorSource['sourceType'][];
    prepare?(context: AddonPrepareContext): Promise<void> | void;
    validateSource(source: RawVideoProcessorSource, context: VideoProcessorContext): Promise<void> | void;
    scan(input: VideoProcessorScanInput, context: VideoProcessorContext): Promise<VideoProcessorScanItem[]> | VideoProcessorScanItem[];
    identify?(input: VideoProcessorIdentifyInput, context: VideoProcessorContext): Promise<VideoMetadata | null>;
    start(input: VideoProcessorStartInput, context: VideoProcessorContext): Promise<VideoProcessorStartOutput>;
};

export class DownloadCancelledError extends Error {
    constructor() {
        super('cancelled-download');
        this.name = 'DownloadCancelledError';
    }
}
