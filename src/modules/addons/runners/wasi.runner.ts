import { AppError } from '@shared/errors';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WASI } from 'node:wasi';
import type { AddonDefinition, AddonRunner, AddonRunnerRun, AddonWorkspace } from '../addons.ports';

export type WasiAddonImplementation = {
    addonDir: string;
    entryPath: string;
    module: WebAssembly.Module;
};

type WasiRunnerResponse =
    | {
          result?: unknown;
          error?: {
              message?: string;
              statusCode?: number;
          };
      }
    | unknown;

const serializeAddonValue = (value: unknown): unknown => {
    if (value instanceof File) {
        return {
            name: value.name,
            size: value.size,
            type: value.type,
            lastModified: value.lastModified,
        };
    }

    if (Array.isArray(value)) return value.map(serializeAddonValue);

    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeAddonValue(item)]));
    }

    return value;
};

type WasiWithImports = WASI & {
    getImportObject?: () => unknown;
    getImports?: (module: WebAssembly.Module) => unknown;
};

const getWasiImports = (wasi: WASI, module: WebAssembly.Module): NonNullable<Parameters<typeof WebAssembly.instantiate>[1]> => {
    const runtime = wasi as WasiWithImports;

    if (typeof runtime.getImportObject === 'function') {
        return runtime.getImportObject() as NonNullable<Parameters<typeof WebAssembly.instantiate>[1]>;
    }

    if (typeof runtime.getImports === 'function') {
        return runtime.getImports(module) as NonNullable<Parameters<typeof WebAssembly.instantiate>[1]>;
    }

    throw new AppError('WASI runtime does not expose imports', { statusCode: 500 });
};

export class WasiAddonRunner implements AddonRunner {
    public readonly runtime = 'wasi' as const;

    public async prepareRun(addon: AddonDefinition, context: { workspace?: AddonWorkspace }): Promise<AddonRunnerRun> {
        if (!context.workspace) {
            throw new AppError(`WASI addon requires a job workspace: ${addon.id}`, { statusCode: 500 });
        }

        return new WasiAddonRunnerRun(addon, addon.implementation as WasiAddonImplementation, context.workspace);
    }
}

class WasiAddonRunnerRun implements AddonRunnerRun {
    constructor(
        private readonly addon: AddonDefinition,
        private readonly implementation: WasiAddonImplementation,
        private readonly workspace: AddonWorkspace
    ) {}

    public async call<TOutput>(method: string, ...args: unknown[]): Promise<TOutput> {
        const callId = randomUUID();
        const requestFile = `${callId}.request.json`;
        const responseFile = `${callId}.response.json`;
        const inputPath = path.join(this.workspace.workDir, requestFile);
        const outputPath = path.join(this.workspace.workDir, responseFile);
        const guestInputPath = path.posix.join('/work', requestFile);
        const guestOutputPath = path.posix.join('/work', responseFile);

        await fsp.writeFile(inputPath, JSON.stringify({ method, args: serializeAddonValue(args) }));

        try {
            await this.startWasi(method, guestInputPath, guestOutputPath);
            const stdoutOutput = await fsp.readFile(outputPath, 'utf-8');
            const response = this.parseResponse(stdoutOutput);

            if (this.isErrorResponse(response)) {
                throw new AppError(response.error?.message ?? 'WASI addon call failed', { statusCode: response.error?.statusCode ?? 500 });
            }

            if (this.isResultResponse(response)) return response.result as TOutput;

            return response as TOutput;
        } finally {
            await Promise.all([fsp.unlink(inputPath).catch(() => {}), fsp.unlink(outputPath).catch(() => {})]);
        }
    }

    public async cleanup() {}

    private async startWasi(method: string, inputPath: string, outputPath: string) {
        const wasi = new WASI({
            version: 'preview1',
            args: ['/addon/main.wasm', method],
            env: {
                DUCKFLIX_ADDON_ID: this.addon.id,
                DUCKFLIX_ADDON_METHOD: method,
                DUCKFLIX_WASI_REQUEST: inputPath,
                DUCKFLIX_WASI_RESPONSE: outputPath,
                PWD: '/',
            },
            preopens: {
                '/work': this.workspace.workDir,
            },
            returnOnExit: true,
        });

        const instance = await WebAssembly.instantiate(this.implementation.module, getWasiImports(wasi, this.implementation.module));
        const currentWorkingDirectory = process.cwd();

        try {
            process.chdir(this.workspace.workDir);
            wasi.start(instance);
        } finally {
            process.chdir(currentWorkingDirectory);
        }
    }

    private parseResponse(output: string): WasiRunnerResponse {
        const trimmed = output.trim();
        if (!trimmed) throw new AppError(`WASI addon returned an empty response: ${this.addon.id}`, { statusCode: 500 });

        try {
            return JSON.parse(trimmed) as WasiRunnerResponse;
        } catch (error) {
            throw new AppError(`Invalid WASI addon response: ${this.addon.id}`, { statusCode: 500, cause: error });
        }
    }

    private isErrorResponse(response: WasiRunnerResponse): response is { error: { message?: string; statusCode?: number } } {
        return !!response && typeof response === 'object' && 'error' in response && !!response.error;
    }

    private isResultResponse(response: WasiRunnerResponse): response is { result: unknown } {
        return !!response && typeof response === 'object' && 'result' in response;
    }
}
