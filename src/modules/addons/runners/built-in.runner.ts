import { AppError } from '@shared/errors';
import type { AddonDefinition, AddonRunner } from '../addons.ports';
import { logger } from '@shared/configs/logger';

export class BuiltInAddonRunner implements AddonRunner {
    public readonly runtime = 'builtIn' as const;

    public async prepareRun(addon: AddonDefinition) {
        const implementation = addon.implementation;

        return {
            call: async <TOutput>(method: string, ...args: unknown[]): Promise<TOutput> => {
                const candidate = (implementation as Record<string, unknown>)[method];
                if (typeof candidate !== 'function') {
                    throw new AppError(`Built-in addon "${addon.id}" does not implement method: ${method}`, { statusCode: 500 });
                }

                logger.debug({ method }, 'Calling Built-In runner method');
                return candidate.apply(implementation, args) satisfies Promise<TOutput>;
            },
            cleanup: async () => {},
        };
    }
}
