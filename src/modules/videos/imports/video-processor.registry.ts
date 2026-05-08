import { AppError } from '@shared/errors';
import { addonRegistry, addonService } from '@modules/addons/addons.container';
import type { AddonRegistry } from '@modules/addons/addons.registry';
import type { AddonDefinition, AddonRun } from '@modules/addons/addons.ports';
import type { BunAddonImplementation } from '@modules/addons/runners/bun.runner';
import type { BuiltInVideoProcessor } from './video-processor.ports';
import type { AddonService } from '@modules/addons/addons.service';
import { z } from 'zod';
import type {
    RawVideoProcessorSource,
    VideoProcessorContext,
    VideoProcessorIdentifyInput,
    VideoProcessorInitialStatus,
    VideoMetadata,
    VideoProcessorModule,
    VideoProcessorScanInput,
    VideoProcessorScanItem,
    VideoProcessorSourceType,
    VideoProcessorStartInput,
    VideoProcessorStartOutput,
} from '@duckflixapp/addon-sdk/types';

type VideoProcessorAddonMetadata = {
    initialStatus?: VideoProcessorInitialStatus;
    sourceTypes: readonly VideoProcessorSourceType[];
};

type VideoProcessorAddonDefinition = AddonDefinition<unknown, VideoProcessorAddonMetadata>;

const preparedSourceSchema = z.discriminatedUnion('sourceType', [
    z.object({
        sourceType: z.literal('file'),
        file: z.instanceof(File),
        tempPath: z.string().trim().min(1),
    }),
    z.object({
        sourceType: z.literal('text'),
        value: z.string(),
    }),
]);

const scanItemSchema = z.object({
    id: z.string().trim().min(1),
    source: preparedSourceSchema,
    requestedType: z.enum(['movie', 'episode']).optional(),
    title: z.string().optional(),
    metadata: z.custom<VideoMetadata | null>().optional(),
});

const startOutputItemSchema = z.object({
    id: z.string().trim().min(1),
    path: z.string().trim().min(1),
    fileName: z.string().trim().min(1),
    fileSize: z.number().nonnegative(),
});

const scanOutputSchema = z.array(scanItemSchema) satisfies z.ZodType<VideoProcessorScanItem[]>;
const startOutputSchema = z.array(startOutputItemSchema) satisfies z.ZodType<VideoProcessorStartOutput>;

export type VideoProcessorRunHandle = AddonRun & {
    processor: VideoProcessorRun;
};

export class VideoProcessorRegistry {
    constructor(
        private readonly addons: AddonRegistry,
        private readonly addonService: AddonService
    ) {}

    public register(processor: BuiltInVideoProcessor) {
        this.addons.register({
            id: processor.id,
            kind: 'video.processor',
            runtime: 'builtIn',
            permissions: processor.permissions,
            implementation: processor,
            metadata: {
                initialStatus: processor.initialStatus,
                sourceTypes: processor.sourceTypes,
            },
            prepare: processor.prepare,
        });
    }

    public list() {
        return this.addons
            .list('video.processor')
            .map((addon) => new VideoProcessorAddon(addon as VideoProcessorAddonDefinition, this.addonService));
    }

    public resolve(id: string) {
        const addon = this.addons.resolve<unknown, VideoProcessorAddonMetadata>('video.processor', id);
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
        private readonly addon: VideoProcessorAddonDefinition,
        private readonly addonService: AddonService
    ) {}

    public get id() {
        return this.addon.id;
    }

    public get initialStatus() {
        return this.addon.metadata?.initialStatus;
    }

    public get sourceTypes() {
        return this.addon.metadata?.sourceTypes ?? [];
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
        private readonly addon: VideoProcessorAddonDefinition,
        private readonly run: AddonRun
    ) {}

    public get id() {
        return this.addon.id;
    }

    public get initialStatus() {
        return this.addon.metadata?.initialStatus;
    }

    public get sourceTypes() {
        return this.addon.metadata?.sourceTypes ?? [];
    }

    public validateSource(source: RawVideoProcessorSource, context: VideoProcessorContext) {
        return this.run.call<void>('validateSource', source, { ...context, workspace: this.run.workspace });
    }

    public async scan(input: VideoProcessorScanInput, context: VideoProcessorContext): Promise<VideoProcessorScanItem[]> {
        const parsed = scanOutputSchema.safeParse(
            await this.run.call<unknown>('scan', input, { ...context, workspace: this.run.workspace })
        );
        if (!parsed.success) {
            throw new AppError(`Processor "${this.id}" returned invalid scan items`, { statusCode: 500 });
        }

        const items = parsed.data;
        if (!items.length) throw new AppError(`Processor "${this.id}" did not return any video items`, { statusCode: 400 });

        return items;
    }

    public async identify(input: VideoProcessorIdentifyInput, context: VideoProcessorContext) {
        if (!this.hasIdentify()) {
            return Promise.resolve(null);
        }

        return this.run
            .call<
                Awaited<ReturnType<NonNullable<VideoProcessorModule['identify']>>>
            >('identify', input, { ...context, workspace: this.run.workspace })
            .then((metadata) => metadata ?? null);
    }

    public async start(input: VideoProcessorStartInput, context: VideoProcessorContext): Promise<VideoProcessorStartOutput> {
        const parsed = startOutputSchema.safeParse(
            await this.run.call<unknown>('start', input, { ...context, workspace: this.run.workspace })
        );
        if (!parsed.success) {
            throw new AppError(`Processor "${this.id}" returned invalid start output`, { statusCode: 500 });
        }

        return parsed.data;
    }

    private hasIdentify() {
        if (this.addon.runtime === 'builtIn') {
            return typeof (this.addon.implementation as Partial<VideoProcessorModule>).identify === 'function';
        }

        if (this.addon.runtime === 'bun') {
            const implementation = this.addon.implementation as BunAddonImplementation;
            return typeof implementation.module.capabilities?.['video.processor']?.identify === 'function';
        }

        return true;
    }
}

export const videoProcessorRegistry = new VideoProcessorRegistry(addonRegistry, addonService);
