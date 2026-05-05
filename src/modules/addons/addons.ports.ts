export type AddonPermission = 'network' | 'filesystem:job' | 'p2p';
export type AddonKind = 'video.processor';

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

export type AddonPrepareTarget = {
    id: string;
    kind: AddonKind;
    permissions?: readonly AddonPermission[];
    prepare?(context: AddonPrepareContext): Promise<void> | void;
};

export type PreparedAddonRun = {
    addonId: string;
    kind: AddonKind;
    workspace?: AddonWorkspace;
    cleanup(): Promise<void>;
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
    description?: string;
    publisher?: string;
    capabilities: AddonCapability[];
    permissions?: AddonPermission[];
};
