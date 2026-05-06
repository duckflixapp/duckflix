import { AppError } from '@shared/errors';
import type { AddonDefinition, AddonRunner } from '../addons.ports';
import { logger } from '@shared/configs/logger';

export type BunAddonImplementation = {
    addonDir: string;
    entryPath: string;
    module: {
        capabilities?: Partial<Record<AddonDefinition['kind'], Record<string, unknown>>>;
    };
};

type AddonThrownError = {
    message?: string;
    statusCode?: number;
    headers?: Record<string, string>;
    details?: Record<string, unknown>;
};

export class BunAddonRunner implements AddonRunner {
    public readonly runtime = 'bun' as const;

    public async prepareRun(addon: AddonDefinition) {
        const implementation = addon.implementation as BunAddonImplementation;

        return {
            call: async <TOutput>(method: string, ...args: unknown[]): Promise<TOutput> => {
                const capability = implementation.module.capabilities?.[addon.kind];
                const candidate = capability?.[method];
                if (typeof candidate !== 'function') {
                    throw new AppError(`Bun addon "${addon.id}" does not implement ${addon.kind} method: ${method}`, { statusCode: 500 });
                }

                logger.debug({ addonId: addon.id, kind: addon.kind, method }, 'Calling Bun addon method');
                try {
                    return (await candidate.apply(capability, args)) satisfies TOutput;
                } catch (error) {
                    throw this.toAppError(addon, method, error);
                }
            },
            cleanup: async () => {},
        };
    }

    private toAppError(addon: AddonDefinition, method: string, error: unknown) {
        if (error instanceof AppError) return error;

        if (error && typeof error === 'object') {
            const addonError = error as AddonThrownError;

            return new AppError(addonError.message ?? `Bun addon "${addon.id}" failed while calling ${method}`, {
                cause: error,
                statusCode: addonError.statusCode,
                headers: addonError.headers,
                details: addonError.details,
            });
        }

        return new AppError(`Bun addon "${addon.id}" failed while calling ${method}`, {
            cause: error,
            statusCode: 500,
        });
    }
}
