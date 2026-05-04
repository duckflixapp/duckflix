import type { Context } from 'elysia';
import { mediaService } from './media.container';
import type { MediaService } from './media.service';

export const createMediaController = (service: MediaService) => ({
    handleStream: async ({ params, query, set }: Context) => {
        const response = await service.stream({
            versionId: params.versionId!,
            file: params.file,
            session: query.session!,
        });

        if (response.contentType) set.headers['content-type'] = response.contentType;

        return response.body;
    },

    handleSubtitle: async ({ params, query }: Context) => {
        const response = await service.subtitle({
            subtitleId: params.subtitleId!,
            session: query.session!,
        });

        return response.body;
    },
});

export const mediaController = createMediaController(mediaService);
export const handleStream = mediaController.handleStream;
export const handleSubtitle = mediaController.handleSubtitle;
