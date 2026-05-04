import { eq } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { subtitles, videos, videoVersions } from '@schema/video.schema';
import type { MediaRepository } from './media.ports';

export const drizzleMediaRepository: MediaRepository = {
    findVideoWithVersions: async (videoId) =>
        (await db.query.videos.findFirst({ where: eq(videos.id, videoId), with: { versions: true } })) ?? null,
    findVideoVersion: async (versionId) => (await db.query.videoVersions.findFirst({ where: eq(videoVersions.id, versionId) })) ?? null,
    findSubtitle: async (subtitleId) => (await db.query.subtitles.findFirst({ where: eq(subtitles.id, subtitleId) })) ?? null,
};
