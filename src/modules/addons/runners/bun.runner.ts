import { AppError } from '@shared/errors';
import type { AddonDefinition, AddonRunner } from '../addons.ports';
import { logger } from '@shared/configs/logger';

export type BunAddonImplementation = {
    addonDir: string;
    entryPath: string;
    exports: Record<string, unknown>;
};

export class BunAddonRunner implements AddonRunner {
    public readonly runtime = 'bun' as const;

    public async prepareRun(addon: AddonDefinition) {
        const implementation = addon.implementation as BunAddonImplementation;

        return {
            call: async <TOutput>(method: string, ...args: unknown[]): Promise<TOutput> => {
                const candidate = implementation.exports[method];
                if (typeof candidate !== 'function') {
                    throw new AppError(`Bun addon "${addon.id}" does not implement method: ${method}`, { statusCode: 500 });
                }

                logger.debug({ addonId: addon.id, method }, 'Calling Bun addon method');
                return candidate.apply(implementation.exports, args) satisfies Promise<TOutput>;
            },
            cleanup: async () => {},
        };
    }
}
