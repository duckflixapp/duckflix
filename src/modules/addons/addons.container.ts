import { AddonRegistry } from './addons.registry';
import { AddonLoader } from './addons.loader';
import { AddonService } from './addons.service';
import { BuiltInAddonRunner } from './runners/built-in.runner';
import { WasiAddonRunner } from './runners/wasi.runner';

export const addonRegistry = new AddonRegistry();
export const addonService = new AddonService([new BuiltInAddonRunner(), new WasiAddonRunner()]);
export const addonLoader = new AddonLoader(addonRegistry);

addonLoader.loadBuiltIns();
