import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { uploaderProcessor } from '@modules/videos/imports/built-in/uploader.processor';
import type { BuiltInVideoProcessor } from '@modules/videos/imports/video-processor.ports';
import { paths } from '@shared/configs/path.config';
import z, { ZodError } from 'zod';
import { AddonRuntimeKindValue, type AddonDefinition, type AddonManifest } from './addons.ports';
import type { AddonRegistry } from './addons.registry';
import { logger } from '@shared/configs/logger';
import type { BunAddonImplementation } from './runners/bun.runner';

const addonIdSchema = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/);

const addonManifestSchema = z.object({
    id: addonIdSchema,
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
    runtime: z.enum(AddonRuntimeKindValue.filter((v) => v !== 'builtIn')),
    entry: z.string().trim().min(1),
    description: z.string().optional(),
    publisher: z.string().optional(),
    permissions: z.array(z.enum(['network', 'filesystem:job', 'p2p'])).optional(),
    capabilities: z.array(
        z.object({
            kind: z.literal('video.processor'),
            processor: z.object({
                id: addonIdSchema,
                initialStatus: z.enum(['processing', 'downloading']).optional(),
                sourceTypes: z.array(z.enum(['file', 'text'])),
            }),
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
    }

    public async loadExternalAddons() {
        const addonDirs = await fs.readdir(this.addonsPath, { withFileTypes: true }).catch(() => []);

        let addons = 0,
            capabilities = 0;
        for (const addonDirent of addonDirs) {
            if (!addonDirent.isDirectory()) continue;
            const addonDir = path.join(this.addonsPath, addonDirent.name);

            try {
                const loaded = await this.loadExternalAddon(addonDir);
                if (!loaded) continue;

                addons++;
                capabilities += loaded.capabilities;
                logger.debug({ name: loaded.name }, 'Loaded addon');
            } catch (error) {
                this.logAddonLoadError(addonDir, error);
            }
        }

        logger.debug({ addons, capabilities }, 'Addons load completed.');
    }

    private registerBuiltInVideoProcessor(processor: BuiltInVideoProcessor) {
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
            BuiltInVideoProcessor,
            { initialStatus: BuiltInVideoProcessor['initialStatus']; sourceTypes: BuiltInVideoProcessor['sourceTypes'] }
        >;

        this.registry.register(addon);
    }

    private async loadExternalAddon(addonDir: string) {
        const manifest = await this.readManifest(addonDir);
        if (!manifest) return null;

        const entryPath = path.resolve(addonDir, manifest.entry);
        const addonRoot = path.resolve(addonDir);
        const relativeEntryPath = path.relative(addonRoot, entryPath);
        if (relativeEntryPath.startsWith('..') || path.isAbsolute(relativeEntryPath)) {
            logger.warn({ id: manifest.id, addonDir, entryPath }, 'Skipped addon because entry path escapes addon root');
            return null;
        }

        const implementation = await this.loadExternalImplementation(manifest, addonDir, entryPath);
        if (!implementation) return null;

        let capabilities = 0;
        for (const capability of manifest.capabilities) {
            if (capability.kind !== 'video.processor') continue;

            this.registry.register({
                id: capability.processor.id,
                kind: capability.kind,
                runtime: manifest.runtime,
                permissions: manifest.permissions,
                implementation,
                metadata: {
                    initialStatus: capability.processor.initialStatus,
                    sourceTypes: capability.processor.sourceTypes,
                },
            });
            capabilities++;
        }

        return { id: manifest.id, name: manifest.name, capabilities };
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
    ): Promise<BunAddonImplementation | null> {
        if (manifest.runtime === 'bun') {
            const addonModule = await import(pathToFileURL(entryPath).href);
            const module =
                addonModule.default && typeof addonModule.default === 'object'
                    ? (addonModule.default as Record<string, unknown>)
                    : (addonModule as Record<string, unknown>);

            return {
                addonDir,
                entryPath,
                module,
            } satisfies BunAddonImplementation;
        }

        return null;
    }

    private logAddonLoadError(addonDir: string, error: unknown) {
        if (error instanceof ZodError) {
            logger.error({ addonDir, issues: error.issues }, 'Failed to load addon manifest');
            return;
        }

        logger.error({ addonDir, err: error }, 'Failed to load addon');
    }
}
