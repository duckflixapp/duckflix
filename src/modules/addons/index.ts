export { addonLoader, addonRegistry, addonService } from './addons.container';
export { AddonLoader } from './addons.loader';
export { AddonRegistry } from './addons.registry';
export { AddonService } from './addons.service';
export { BuiltInAddonRunner } from './runners/built-in.runner';
export { BunAddonRunner } from './runners/bun.runner';
export type { RegisteredAddon } from './addons.registry';
export type { BunAddonImplementation } from './runners/bun.runner';
export type {
    AddonCapability,
    AddonDefinition,
    AddonKind,
    AddonManifest,
    AddonPermission,
    AddonPrepareContext,
    AddonRun,
    AddonRunner,
    AddonRunnerRun,
    AddonRuntimeKind,
    AddonWorkspace,
    VideoProcessorCapability,
} from './addons.ports';
