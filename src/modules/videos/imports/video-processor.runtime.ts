import { AddonRuntime, type PreparedAddonRun } from '@modules/addons';
import type {
    RawVideoProcessorSource,
    VideoProcessor,
    VideoProcessorContext,
    VideoProcessorIdentifyInput,
    VideoProcessorStartInput,
} from './video-processor.ports';

export type PreparedVideoProcessorRun = PreparedAddonRun & {
    processor: VideoProcessorRunProcessor;
};

export class VideoProcessorRuntime extends AddonRuntime<VideoProcessor> {
    constructor(processor: VideoProcessor) {
        super(processor, 'video.processor');
    }

    public get builtIn() {
        return this.instance.builtIn;
    }

    public get initialStatus() {
        return this.instance.initialStatus;
    }

    public get sourceTypes() {
        return this.instance.sourceTypes;
    }

    public override async prepareRun(): Promise<PreparedVideoProcessorRun> {
        const run = await super.prepareRun();

        return {
            ...run,
            processor: new VideoProcessorRunProcessor(this, run),
        };
    }

    public validateSource(source: RawVideoProcessorSource) {
        return this.instance.validateSource(source);
    }

    public identify(input: VideoProcessorIdentifyInput) {
        return this.instance.identify?.(input) ?? Promise.resolve(null);
    }

    public start(input: VideoProcessorStartInput, context: VideoProcessorContext) {
        return this.instance.start(input, context);
    }
}

export class VideoProcessorRunProcessor {
    constructor(
        private readonly runtime: VideoProcessorRuntime,
        private readonly run: PreparedAddonRun
    ) {}

    public get id() {
        return this.runtime.id;
    }

    public get builtIn() {
        return this.runtime.builtIn;
    }

    public get initialStatus() {
        return this.runtime.initialStatus;
    }

    public get sourceTypes() {
        return this.runtime.sourceTypes;
    }

    public validateSource(source: RawVideoProcessorSource) {
        return this.runtime.validateSource(source);
    }

    public identify(input: VideoProcessorIdentifyInput) {
        return this.runtime.identify(input);
    }

    public start(input: VideoProcessorStartInput, context: VideoProcessorContext) {
        return this.runtime.start(input, { ...context, workspace: this.run.workspace });
    }
}
