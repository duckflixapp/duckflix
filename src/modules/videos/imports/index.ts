export { videoProcessorRegistry, VideoProcessorAddon, VideoProcessorRegistry, VideoProcessorRun } from './video-processor.registry';
export type { VideoProcessorRunHandle } from './video-processor.registry';
export type {
    PreparedVideoProcessorSource,
    RawVideoProcessorSource,
    VideoProcessorIdentifyInput,
    VideoProcessorModule,
    VideoProcessorStartInput,
    VideoProcessorStartOutput,
    VideoProcessorContext,
} from '@duckflixapp/addon-sdk/types';

export type { BuiltInVideoProcessor } from './video-processor.ports';
