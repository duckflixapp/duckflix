import { AppError } from '@shared/errors';
import type { AddonDefinition, AddonKind } from './addons.ports';

export type RegisteredAddon = AddonDefinition;

export class AddonRegistry {
    private readonly addons = new Map<AddonKind, Map<string, AddonDefinition>>();

    public register(addon: AddonDefinition) {
        const scopedAddons = this.addons.get(addon.kind) ?? new Map<string, AddonDefinition>();
        if (scopedAddons.has(addon.id)) throw new AppError(`Addon already registered: ${addon.kind}:${addon.id}`);

        scopedAddons.set(addon.id, addon);
        this.addons.set(addon.kind, scopedAddons);
    }

    public list(kind?: AddonKind) {
        if (kind) return Array.from(this.addons.get(kind)?.values() ?? []);

        return Array.from(this.addons.values()).flatMap((scopedAddons) => Array.from(scopedAddons.values()));
    }

    public resolve<TImplementation = unknown>(kind: AddonKind, id: string): AddonDefinition<TImplementation> | null {
        return (this.addons.get(kind)?.get(id) as AddonDefinition<TImplementation> | undefined) ?? null;
    }
}
