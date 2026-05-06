export type AddonPermission = 'network' | 'filesystem:job' | 'p2p';
export type AddonKind = 'video.processor';
export type AddonRuntimeKind = 'builtIn' | 'wasi';

export type AddonWorkspace = {
    id: string;
    addonId: string;
    kind: AddonKind;
    root: string;
    inputDir: string;
    workDir: string;
    outputDir: string;
};

export type AddonPrepareContext = {
    workspace?: AddonWorkspace;
};

export type AddonDefinition<TImplementation = unknown, TMetadata = unknown> = {
    id: string;
    kind: AddonKind;
    runtime: AddonRuntimeKind;
    permissions?: readonly AddonPermission[];
    implementation: TImplementation;
    metadata?: TMetadata;
    prepare?(context: AddonPrepareContext): Promise<void> | void;
};

export type AddonRun = {
    addonId: string;
    kind: AddonKind;
    runtime: AddonRuntimeKind;
    workspace?: AddonWorkspace;
    call<TOutput>(method: string, ...args: unknown[]): Promise<TOutput>;
    cleanup(): Promise<void>;
};

export type AddonRunnerRun = {
    call<TOutput>(method: string, ...args: unknown[]): Promise<TOutput>;
    cleanup(): Promise<void>;
};

export type AddonRunner = {
    runtime: AddonRuntimeKind;
    prepareRun(addon: AddonDefinition, context: { workspace?: AddonWorkspace }): Promise<AddonRunnerRun>;
};

export type VideoProcessorCapability = {
    kind: 'video.processor';
    processors: Array<{
        id: string;
        sourceTypes: string[];
    }>;
};

export type AddonCapability = VideoProcessorCapability;

export type AddonManifest = {
    id: string;
    name: string;
    version: string;
    runtime: Exclude<AddonRuntimeKind, 'builtIn'>;
    entry: string;
    description?: string;
    publisher?: string;
    capabilities: AddonCapability[];
    permissions?: AddonPermission[];
};
