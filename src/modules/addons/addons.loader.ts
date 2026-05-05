import { torrentProcessor } from '@modules/videos/imports/built-in/torrent.processor';
import { uploaderProcessor } from '@modules/videos/imports/built-in/uploader.processor';
import type { VideoProcessor } from '@modules/videos/imports/video-processor.ports';
import type { AddonDefinition } from './addons.ports';
import type { AddonRegistry } from './addons.registry';

export class AddonLoader {
    constructor(private readonly registry: AddonRegistry) {}

    public loadBuiltIns() {
        this.registerBuiltInVideoProcessor(uploaderProcessor);
        this.registerBuiltInVideoProcessor(torrentProcessor);
    }

    public async loadExternalAddons() {
        throw new Error('External addon loading is not implemented yet');
    }

    private registerBuiltInVideoProcessor(processor: VideoProcessor) {
        const addon = {
            id: processor.id,
            kind: 'video.processor',
            runtime: 'builtIn',
            permissions: processor.permissions,
            implementation: processor,
            prepare: processor.prepare,
        } satisfies AddonDefinition<VideoProcessor>;

        this.registry.register(addon);
    }
}
