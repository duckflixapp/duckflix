export type AddonPermission = 'network' | 'filesystem:job' | 'p2p';

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
