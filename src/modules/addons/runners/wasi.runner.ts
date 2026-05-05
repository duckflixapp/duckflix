import { AppError } from '@shared/errors';
import type { AddonDefinition, AddonRunner, AddonRunnerRun } from '../addons.ports';

export class WasiAddonRunner implements AddonRunner {
    public readonly runtime = 'wasi' as const;

    public async prepareRun(addon: AddonDefinition): Promise<AddonRunnerRun> {
        throw new AppError(`WASI addon runtime is not implemented yet: ${addon.id}`, { statusCode: 501 });
    }
}
