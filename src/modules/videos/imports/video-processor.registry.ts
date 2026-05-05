import { AppError } from '@shared/errors';
import { addonRegistry, addonService } from '@modules/addons/addons.container';
import type { AddonRegistry } from '@modules/addons/addons.registry';
import type { AddonDefinition, AddonRun } from '@modules/addons/addons.ports';
import type {
    RawVideoProcessorSource,
    VideoProcessor,
    VideoProcessorContext,
    VideoProcessorIdentifyInput,
    VideoProcessorStartInput,
    VideoProcessorStartOutput,
} from './video-processor.ports';
import type { AddonService } from '@modules/addons/addons.service';

export type VideoProcessorRunHandle = AddonRun & {
    processor: VideoProcessorRun;
};

export class VideoProcessorRegistry {
    constructor(
        private readonly addons: AddonRegistry,
        private readonly addonService: AddonService
    ) {}

    public register(processor: VideoProcessor) {
        this.addons.register({
            id: processor.id,
            kind: 'video.processor',
            runtime: 'builtIn',
            permissions: processor.permissions,
            implementation: processor,
            prepare: processor.prepare,
        });
    }

    public list() {
        return this.addons
            .list('video.processor')
            .map((addon) => new VideoProcessorAddon(addon as AddonDefinition<VideoProcessor>, this.addonService));
    }

    public resolve(id: string) {
        const addon = this.addons.resolve<VideoProcessor>('video.processor', id);
        return addon ? new VideoProcessorAddon(addon, this.addonService) : null;
    }

    public ensureSourceSupported(
        processor: Pick<VideoProcessorAddon | VideoProcessorRun, 'id' | 'sourceTypes'>,
        sourceType: RawVideoProcessorSource['sourceType']
    ) {
        if (!processor.sourceTypes.includes(sourceType)) {
            throw new AppError(`Processor "${processor.id}" does not support "${sourceType}" sources`, { statusCode: 400 });
        }
    }
}

export class VideoProcessorAddon {
    constructor(
        private readonly addon: AddonDefinition<VideoProcessor>,
        private readonly addonService: AddonService
    ) {}

    public get id() {
        return this.addon.id;
    }

    public get initialStatus() {
        return this.addon.implementation.initialStatus;
    }

    public get sourceTypes() {
        return this.addon.implementation.sourceTypes;
    }

    public async prepareRun(): Promise<VideoProcessorRunHandle> {
        const run = await this.addonService.prepareRun(this.addon);

        return {
            ...run,
            processor: new VideoProcessorRun(this.addon, run),
        };
    }
}

export class VideoProcessorRun {
    constructor(
        private readonly addon: AddonDefinition<VideoProcessor>,
        private readonly run: AddonRun
    ) {}

    public get id() {
        return this.addon.id;
    }

    public get initialStatus() {
        return this.addon.implementation.initialStatus;
    }

    public get sourceTypes() {
        return this.addon.implementation.sourceTypes;
    }

    public validateSource(source: RawVideoProcessorSource) {
        return this.run.call<void>('validateSource', source);
    }

    public async identify(input: VideoProcessorIdentifyInput) {
        if (!this.addon.implementation.identify) return Promise.resolve(null);

        return this.run
            .call<Awaited<ReturnType<NonNullable<VideoProcessor['identify']>>>>('identify', input)
            .then((metadata) => metadata ?? null);
    }

    public start(input: VideoProcessorStartInput, context: VideoProcessorContext): Promise<VideoProcessorStartOutput> {
        return this.run.call<VideoProcessorStartOutput>('start', input, { ...context, workspace: this.run.workspace });
    }
}

export const videoProcessorRegistry = new VideoProcessorRegistry(addonRegistry, addonService);
