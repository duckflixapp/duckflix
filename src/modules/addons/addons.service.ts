import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { paths } from '@shared/configs/path.config';
import { AppError } from '@shared/errors';
import type { AddonDefinition, AddonRunner, AddonRuntimeKind, AddonWorkspace, AddonRun } from './addons.ports';

export class AddonService {
    private readonly runners = new Map<AddonRuntimeKind, AddonRunner>();

    constructor(
        runners: AddonRunner[],
        private readonly rootPath = paths.addons
    ) {
        runners.forEach((runner) => this.runners.set(runner.runtime, runner));
    }

    public async prepareRun(addon: AddonDefinition): Promise<AddonRun> {
        let workspace: AddonWorkspace | undefined;
        let runnerRun: Awaited<ReturnType<AddonRunner['prepareRun']>> | undefined;

        try {
            if (addon.permissions?.includes('filesystem:job')) {
                workspace = await this.createWorkspace(addon);
            }

            await addon.prepare?.({
                get workspace() {
                    return workspace;
                },
            });

            const runner = this.runners.get(addon.runtime);
            if (!runner) throw new AppError(`Addon runtime is not available: ${addon.runtime}`, { statusCode: 500 });

            runnerRun = await runner.prepareRun(addon, { workspace });
        } catch (error) {
            if (workspace) await fs.rm(workspace.root, { recursive: true, force: true }).catch(() => {});
            throw error;
        }

        return {
            addonId: addon.id,
            kind: addon.kind,
            runtime: addon.runtime,
            get workspace() {
                return workspace;
            },
            call: async (method, ...args) => {
                if (!runnerRun) throw new AppError('Addon run is not prepared', { statusCode: 500 });
                return runnerRun.call(method, ...args);
            },
            cleanup: async () => {
                await runnerRun?.cleanup();
                if (!workspace) return;
                await fs.rm(workspace.root, { recursive: true, force: true }).catch(() => {});
            },
        };
    }

    private async createWorkspace(addon: AddonDefinition): Promise<AddonWorkspace> {
        const id = randomUUID();
        const root = path.resolve(this.rootPath, addon.kind, addon.id, id);
        const workspace = {
            id,
            addonId: addon.id,
            kind: addon.kind,
            root,
            inputDir: path.join(root, 'input'),
            workDir: path.join(root, 'work'),
            outputDir: path.join(root, 'output'),
        } satisfies AddonWorkspace;

        await fs.mkdir(workspace.inputDir, { recursive: true });
        await fs.mkdir(workspace.workDir, { recursive: true });
        await fs.mkdir(workspace.outputDir, { recursive: true });

        return workspace;
    }
}
