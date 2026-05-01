import { videos } from '@schema/video.schema';
import { eq } from 'drizzle-orm';
import { NoVideoMediaFoundError, VideoNotFoundError } from '../live.errors';
import { sessionClient } from '@modules/media/session/session.client';
import { db } from '@shared/configs/db';

export const createSession = async (accountId: string, videoId: string): Promise<string> => {
    const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId), with: { versions: true } });
    if (!video) throw new VideoNotFoundError();

    const original = video.versions.find((v) => v.isOriginal);
    if (!original) throw new NoVideoMediaFoundError();

    const sessionId = await sessionClient.create({
        accountId,
        videoId: video.id,
        original: {
            storageKey: original.storageKey,
            height: original.height,
            duration: video.duration!,
        },
    });

    return sessionId;
};
