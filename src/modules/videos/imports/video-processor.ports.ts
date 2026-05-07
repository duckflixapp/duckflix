import type { AddonPermission, AddonPrepareContext } from '@modules/addons/addons.ports';
import type { VideoProcessorInitialStatus, VideoProcessorModule, VideoProcessorSourceType } from '@duckflixapp/addon-sdk/types';

export type BuiltInVideoProcessor = VideoProcessorModule & {
    id: string;
    builtIn: true;
    initialStatus?: VideoProcessorInitialStatus;
    permissions?: readonly AddonPermission[];
    sourceTypes: readonly VideoProcessorSourceType[];
    prepare?(context: AddonPrepareContext): Promise<void> | void;
};

export class DownloadCancelledError extends Error {
    constructor() {
        super('cancelled-download');
        this.name = 'DownloadCancelledError';
    }
}
