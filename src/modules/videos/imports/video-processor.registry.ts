import { AppError } from '@shared/errors';
import type { RawVideoProcessorSource, VideoProcessor } from './video-processor.ports';

export class VideoProcessorRegistry {
    private readonly processors = new Map<string, VideoProcessor>();

    constructor(processors: VideoProcessor[] = []) {
        processors.forEach((processor) => this.register(processor));
    }

    public register(processor: VideoProcessor) {
        if (this.processors.has(processor.id)) throw new AppError(`Video processor already registered: ${processor.id}`);
        this.processors.set(processor.id, processor);
    }

    public list() {
        return Array.from(this.processors.values());
    }

    public resolve(id: string) {
        return this.processors.get(id) ?? null;
    }

    public ensureSourceSupported(processor: VideoProcessor, sourceType: RawVideoProcessorSource['sourceType']) {
        if (!processor.sourceTypes.includes(sourceType)) {
            throw new AppError(`Processor "${processor.id}" does not support "${sourceType}" sources`, { statusCode: 400 });
        }
    }
}
