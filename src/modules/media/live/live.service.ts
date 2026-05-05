import { env } from '@core/env';
import { paths } from '@shared/configs/path.config';
import { NotStandardResolutionError, NoVideoMediaFoundError, TooBigResolutionError, VideoNotFoundError } from './live.errors';
import { LiveSessionManager } from './live-session-manager';
import { drizzleMediaRepository } from '../media.drizzle.repository';
import type { MediaPaths, MediaRepository, VideoWithVersions } from '../media.ports';
import type { Video, VideoVersion } from '@schema/video.schema';

export const livePresets = [
    { name: '2160p', height: 2160, bitrate: 20000000 },
    { name: '1440p', height: 1440, bitrate: 10000000 },
    { name: '1080p', height: 1080, bitrate: 5000000 },
    { name: '720p', height: 720, bitrate: 2800000 },
    { name: '480p', height: 480, bitrate: 1400000 },
];

export const presetHeights = livePresets.map((preset) => preset.height);

const masterStream = (stream: { streamUrl: string; width: number; height: number; bandwidth: number; name: string; session?: string }) => {
    let item = `#EXT-X-STREAM-INF:BANDWIDTH=${stream.height * 2000},RESOLUTION=${stream.width}x${stream.height},NAME="${stream.name}"\n`;
    item += `${stream.streamUrl}${stream.session ? '?session=' + stream.session : ''}\n`;
    return item;
};

export interface LiveMediaServiceDependencies {
    mediaRepository: MediaRepository;
    liveSessionManager: Pick<LiveSessionManager, 'ensureSegment'>;
    baseUrl: string;
}

export const createLiveMediaService = ({ mediaRepository, liveSessionManager, baseUrl }: LiveMediaServiceDependencies) => {
    const mediaBase = `${baseUrl}/media`;

    const getVideoWithOriginal = async (videoId: string): Promise<{ video: VideoWithVersions; original: VideoVersion }> => {
        const video = await mediaRepository.findVideoWithVersions(videoId);
        if (!video) throw new VideoNotFoundError();
        if (!video.duration) throw new NoVideoMediaFoundError();

        const original = video.versions.find((version) => version.isOriginal);
        if (!original) throw new NoVideoMediaFoundError();

        return { video, original };
    };

    const generateMasterFile = async (videoId: string, session: string) => {
        const { video, original } = await getVideoWithOriginal(videoId);
        const versions = video.versions
            .filter((version) => version.mimeType === 'application/x-mpegURL')
            .sort((a, b) => b.height - a.height);
        const includedHeights = versions.map((version) => version.height);

        let master = `#EXTM3U\n`;

        if (!includedHeights.includes(original.height)) {
            const originalWidth = original.width || 1920;
            master += `#EXT-X-STREAM-INF:BANDWIDTH=${original.height * 2000},RESOLUTION=${originalWidth}x${original.height},NAME="Original"\n`;
            master += `${mediaBase}/live/${video.id}/${original.height}/index.m3u8?session=${session}\n\n`;
        }

        versions.forEach((version) => {
            master += masterStream({
                streamUrl: `${mediaBase}/stream/${version.id}/index.m3u8`,
                width: version.width ?? 0,
                height: version.height,
                bandwidth: version.height * 2000,
                name: `${version.height}p`,
                session,
            });
        });

        const aspect = (original.width || 16) / original.height;
        livePresets
            .filter((preset) => preset.height < original.height && !includedHeights.includes(preset.height))
            .forEach((preset) => {
                const width = Math.round((preset.height * aspect) / 2) * 2;
                master += masterStream({
                    streamUrl: `${mediaBase}/live/${video.id}/${preset.height}/index.m3u8`,
                    width,
                    height: preset.height,
                    bandwidth: preset.bitrate,
                    name: preset.name,
                    session,
                });
            });

        return master;
    };

    const generateManifestFile = async (
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
            m3u8 += `${baseUrl}/media/live/${video.id}/${height}/seg-${i}.ts?session=${session}\n`;
        }

        m3u8 += '#EXT-X-ENDLIST';

        return m3u8;
    };

    const ensureLiveSegment = async (
        session: string,
        height: number,
        original: { storageKey: string; height: number; duration: number },
        options = { segment: 0, segmentDuration: 6 }
    ) => liveSessionManager.ensureSegment(session, height, original, options);

    return {
        generateMasterFile,
        getVideoWithOriginal,
        generateManifestFile,
        ensureLiveSegment,
        liveSessionManager,
    };
};

export type LiveMediaService = ReturnType<typeof createLiveMediaService>;

const defaultLiveSessionManager = new LiveSessionManager({
    paths: paths satisfies MediaPaths,
    presetHeights,
    taskFactory: async (...args) => {
        const { SessionTask } = await import('../sessionTask');
        return new SessionTask(...args);
    },
});

export const liveMediaService = createLiveMediaService({
    mediaRepository: drizzleMediaRepository,
    liveSessionManager: defaultLiveSessionManager,
    baseUrl: env.BASE_URL,
});

export const liveSessionManager = defaultLiveSessionManager;
export const generateMasterFile = liveMediaService.generateMasterFile;
export const getVideoWithOriginal = liveMediaService.getVideoWithOriginal;
export const generateManifestFile = liveMediaService.generateManifestFile;
export const ensureLiveSegment = liveMediaService.ensureLiveSegment;
