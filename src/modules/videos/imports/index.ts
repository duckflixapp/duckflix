export { videoProcessorRegistry, VideoProcessorAddon, VideoProcessorRegistry, VideoProcessorRun } from './video-processor.registry';
export type { VideoProcessorRunHandle } from './video-processor.registry';
export type {
    PreparedVideoProcessorSource,
    RawVideoProcessorSource,
    VideoProcessorIdentifyInput,
    VideoProcessorStartInput,
    VideoProcessorStartOutput,
    VideoProcessorContext,
} from '@duckflixapp/addon-sdk/types';

export type { VideoProcessor } from './video-processor.ports';
