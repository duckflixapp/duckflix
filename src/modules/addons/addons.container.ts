import { AddonRegistry } from './addons.registry';
import { AddonLoader } from './addons.loader';
import { AddonService } from './addons.service';
import { BuiltInAddonRunner } from './runners/built-in.runner';
import { BunAddonRunner } from './runners/bun.runner';

export const addonRegistry = new AddonRegistry();
export const addonService = new AddonService([new BuiltInAddonRunner(), new BunAddonRunner()]);
export const addonLoader = new AddonLoader(addonRegistry);

addonLoader.loadBuiltIns();
