import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { paths } from '@shared/configs/path.config';
import type { AddonKind, AddonPrepareTarget, AddonWorkspace, PreparedAddonRun } from './addons.ports';

type AddonRuntimeTarget = Omit<AddonPrepareTarget, 'kind'>;

export class AddonRuntime<TAddon extends AddonRuntimeTarget> {
    constructor(
        protected readonly addon: TAddon,
        protected readonly kind: AddonKind,
        private readonly rootPath = paths.addons
    ) {}

    public get instance() {
        return this.addon;
    }

    public get id() {
        return this.addon.id;
    }

    public get permissions() {
        return this.addon.permissions;
    }

    public prepareRun(): Promise<PreparedAddonRun> {
        return this.prepare({
            id: this.addon.id,
            kind: this.kind,
            permissions: this.addon.permissions,
            prepare: this.addon.prepare,
        });
    }

    private async prepare(addon: AddonPrepareTarget): Promise<PreparedAddonRun> {
        let workspace: AddonWorkspace | undefined;

        try {
            if (addon.permissions?.includes('filesystem:job')) {
                workspace = await this.createWorkspace(addon);
            }

            await addon.prepare?.({
                get workspace() {
                    return workspace;
                },
            });
        } catch (error) {
            if (workspace) await fs.rm(workspace.root, { recursive: true, force: true }).catch(() => {});
            throw error;
        }

        return {
            addonId: addon.id,
            kind: addon.kind,
            get workspace() {
                return workspace;
            },
            cleanup: async () => {
                if (!workspace) return;
                await fs.rm(workspace.root, { recursive: true, force: true }).catch(() => {});
            },
        };
    }

    private async createWorkspace(addon: AddonPrepareTarget): Promise<AddonWorkspace> {
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
