import { eq } from 'drizzle-orm';
import { videos, type Video, type VideoVersion } from '@schema/video.schema';
import { db } from '@shared/configs/db';
import { env } from '@core/env';
import { NotStandardResolutionError, NoVideoMediaFoundError, TooBigResolutionError, VideoNotFoundError } from './live.errors';
import { SessionTask } from './sessionTask';
import path from 'node:path';
import { paths } from '@shared/configs/path.config';
import fs from 'node:fs/promises';

const sessionRegistry = new Map<string, SessionTask>();
const sessionRef = new Map<string, number>();

export const liveSessionManager = {
    size: () => sessionRegistry.size,
    destroyAll: () => sessionRegistry.values().forEach((s) => s.destroy()),
};

const livePresets = [
    { name: '2160p', height: 2160, bitrate: 20000000 },
    { name: '1440p', height: 1440, bitrate: 10000000 },
    { name: '1080p', height: 1080, bitrate: 5000000 },
    { name: '720p', height: 720, bitrate: 2800000 },
    { name: '480p', height: 480, bitrate: 1400000 },
];
const presetHeights = livePresets.map((p) => p.height);

const masterStream = (v: { streamUrl: string; width: number; height: number; bandwidth: number; name: string; session?: string }) => {
    let stream = `#EXT-X-STREAM-INF:BANDWIDTH=${v.height * 2000},RESOLUTION=${v.width}x${v.height},NAME="${v.name}"\n`;
    stream += `${v.streamUrl}${v.session ? '?session=' + v.session : ''}\n`;
    return stream;
};

const mediaBase = `${env.BASE_URL}/media`;

export const generateMasterFile = async (videoId: string, session: string) => {
    const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId), with: { versions: true } });
    if (!video) throw new VideoNotFoundError();

    const original = video.versions.find((v) => v.isOriginal);
    if (!original) throw new NoVideoMediaFoundError();

    const versions = video.versions.filter((v) => v.mimeType === 'application/x-mpegURL').sort((a, b) => b.height - a.height);
    const includedHeights = versions.map((v) => v.height);

    let master = `#EXTM3U\n`;

    // add original if not in versions as original
    if (!includedHeights.includes(original.height)) {
        const originalWidth = original.width || 1920;
        master += `#EXT-X-STREAM-INF:BANDWIDTH=${original.height * 2000},RESOLUTION=${originalWidth}x${original.height},NAME="Original"\n`;
        master += `${mediaBase}/live/${video.id}/${original.height}/index.m3u8?session=${session}\n\n`;
    }

    // add every existing version
    versions.forEach((v) => {
        master += masterStream({
            streamUrl: `${mediaBase}/stream/${v.id}/index.m3u8`,
            width: v.width ?? 0,
            height: v.height,
            bandwidth: v.height * 2000,
            name: `${v.height}p`,
            session,
        });
    });

    // add live presets
    const aspect = (original.width || 16) / original.height;
    livePresets
        .filter((p) => p.height < original.height && !includedHeights.includes(p.height))
        .forEach((p) => {
            const width = Math.round((p.height * aspect) / 2) * 2;
            master += masterStream({
                streamUrl: `${mediaBase}/live/${video.id}/${p.height}/index.m3u8`,
                width,
                height: p.height,
                bandwidth: p.bitrate,
                name: p.name,
                session,
            });
        });

    return master;
};

export const getVideoWithOriginal = async (videoId: string): Promise<{ video: Video; original: VideoVersion }> => {
    const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId), with: { versions: true } });
    if (!video) throw new VideoNotFoundError();
    if (!video.duration) throw new NoVideoMediaFoundError();

    const original = video.versions.find((v) => v.isOriginal);
    if (!original) throw new NoVideoMediaFoundError();

    return { video, original };
};

export const generateManifestFile = async (
    video: Video,
    original: VideoVersion,
    height: number,
    session: string,
    options = { segmentDuration: 6 }
) => {
    if (height > original.height) throw new TooBigResolutionError();
    if (!presetHeights.includes(height) && height !== original.height) throw new NotStandardResolutionError();

    const totalSegments = Math.ceil(video.duration! / options.segmentDuration);

    let m3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:${options.segmentDuration}
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD\n`;

    for (let i = 0; i < totalSegments; i++) {
        const duration = i === totalSegments - 1 ? video.duration! - i * options.segmentDuration : options.segmentDuration;

        m3u8 += `#EXTINF:${duration.toFixed(6)},\n`;
        m3u8 += `${env.BASE_URL}/media/live/${video.id}/${height}/seg-${i}.ts?session=${session}\n`;
    }
    m3u8 += '#EXT-X-ENDLIST';

    return m3u8;
};

export const ensureLiveSegment = async (
    session: string,
    height: number,
    original: { storageKey: string; height: number; duration: number },
    options = { segment: 0, segmentDuration: 6 }
) => {
    if (height > original.height) throw new TooBigResolutionError();
    if (!presetHeights.includes(height)) throw new NotStandardResolutionError();

    const sessionPath = path.resolve(paths.live, session, String(height));
    const sessionKey = `${session}:${height}`;
    let sessionTask = sessionRegistry.get(sessionKey);
    if (!sessionTask) {
        const sourcePath = path.resolve(paths.storage, original.storageKey);
        const totalSegments = Math.ceil(original.duration / options.segmentDuration);
        sessionTask = new SessionTask(session, sourcePath, sessionPath, options.segmentDuration, height, totalSegments, async () => {
            sessionRegistry.delete(sessionKey);

            const ref = (sessionRef.get(session) ?? 0) - 1;

            if (ref <= 0) {
                sessionRef.delete(session);
                await fs.rm(path.resolve(paths.live, session), { recursive: true, force: true }).catch(() => {});
            } else {
                sessionRef.set(session, ref);
                await fs.rm(sessionPath, { recursive: true, force: true }).catch(() => {});
            }
        });
        sessionRegistry.set(sessionKey, sessionTask);
        sessionRef.set(session, (sessionRef.get(session) ?? 0) + 1);
        await sessionTask.initalize();
    }

    await sessionTask.prepareSegment(options.segment, { height });

    return path.join(sessionPath, `seg-${options.segment}.ts`);
};
