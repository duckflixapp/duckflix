import { uploaderProcessor } from './built-in/uploader.processor';
import { VideoProcessorRegistry } from './video-processor.registry';

export const videoProcessorRegistry = new VideoProcessorRegistry([uploaderProcessor]);
