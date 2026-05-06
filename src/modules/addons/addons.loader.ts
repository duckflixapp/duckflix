import fs from 'node:fs/promises';
import path from 'node:path';
import { torrentProcessor } from '@modules/videos/imports/built-in/torrent.processor';
import { uploaderProcessor } from '@modules/videos/imports/built-in/uploader.processor';
import type { VideoProcessor } from '@modules/videos/imports/video-processor.ports';
import { paths } from '@shared/configs/path.config';
import z, { ZodError } from 'zod';
import type { AddonDefinition, AddonManifest } from './addons.ports';
import type { AddonRegistry } from './addons.registry';
import type { WasiAddonImplementation } from './runners/wasi.runner';
import { logger } from '@shared/configs/logger';

const addonManifestSchema = z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
    runtime: z.enum(['wasi']),
    entry: z.string().trim().min(1),
    description: z.string().optional(),
    publisher: z.string().optional(),
    permissions: z.array(z.enum(['network', 'filesystem:job', 'p2p'])).optional(),
    capabilities: z.array(
        z.object({
            kind: z.literal('video.processor'),
            processors: z.array(
                z.object({
                    id: z.string().trim().min(1),
                    sourceTypes: z.array(z.enum(['file', 'text'])),
                })
            ),
        })
    ),
}) satisfies z.ZodType<AddonManifest>;

export class AddonLoader {
    constructor(
        private readonly registry: AddonRegistry,
        private readonly addonsPath = paths.addons
    ) {}

    public loadBuiltIns() {
        this.registerBuiltInVideoProcessor(uploaderProcessor);
        this.registerBuiltInVideoProcessor(torrentProcessor);
    }

    public async loadExternalAddons() {
        const addonDirs = await fs.readdir(this.addonsPath, { withFileTypes: true }).catch(() => []);

        for (const addonDirent of addonDirs) {
            if (!addonDirent.isDirectory()) continue;

            const addonDir = path.join(this.addonsPath, addonDirent.name);
            const manifest = await this.readManifest(addonDir).catch((e) => {
                if (e instanceof ZodError) {
                    logger.error({ message: JSON.parse(e.message) }, 'Failed to load addon manifest');
                } else throw e;
            });
            if (!manifest) continue;

            const entryPath = path.resolve(addonDir, manifest.entry);
            const addonRoot = addonDir.endsWith(path.sep) ? addonDir : `${addonDir}${path.sep}`;
            if (!entryPath.startsWith(addonRoot)) continue;
            const implementation = await this.loadExternalImplementation(manifest, addonDir, entryPath);
            if (!implementation) continue;

            for (const capability of manifest.capabilities) {
                if (capability.kind !== 'video.processor') continue;

                for (const processor of capability.processors) {
                    this.registry.register({
                        id: processor.id,
                        kind: 'video.processor',
                        runtime: manifest.runtime,
                        permissions: manifest.permissions,
                        implementation,
                        metadata: {
                            sourceTypes: processor.sourceTypes,
                        },
                    });
                }
            }
            logger.debug({ id: manifest.id }, 'Loaded addon');
        }
    }

    private registerBuiltInVideoProcessor(processor: VideoProcessor) {
        const addon = {
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
        } satisfies AddonDefinition<
            VideoProcessor,
            { initialStatus: VideoProcessor['initialStatus']; sourceTypes: VideoProcessor['sourceTypes'] }
        >;

        this.registry.register(addon);
    }

    private async readManifest(addonDir: string) {
        const manifestPath = path.join(addonDir, 'manifest.json');
        const rawManifest = await fs.readFile(manifestPath, 'utf-8').catch(() => null);
        if (!rawManifest) return null;

        return addonManifestSchema.parse(JSON.parse(rawManifest));
    }

    private async loadExternalImplementation(
        manifest: AddonManifest,
        addonDir: string,
        entryPath: string
    ): Promise<WasiAddonImplementation | null> {
        if (manifest.runtime === 'wasi') {
            const wasmBytes = await fs.readFile(entryPath);
            return {
                addonDir,
                entryPath,
                module: await WebAssembly.compile(wasmBytes),
            } satisfies WasiAddonImplementation;
        }
        return null;
    }
}
