import { logger } from '@shared/configs/logger';
import { fillEpisodeFromTMDBIds } from '@shared/services/metadata/providers/tmdb.provider';
import { resolveMetadata } from '@shared/services/metadata/metadata.service';
import { episodeMetadataSchema, type EpisodeMetadata } from '@shared/services/metadata/metadata.validator';
import path from 'node:path';

export const identifyEpisode = async (filePath: string, fileName?: string, dbUrl?: string): Promise<EpisodeMetadata> => {
    const filename = fileName ?? path.basename(filePath);
    const parsed = parseEpisodeFilename(filename);

    logger.debug({ filePath, parsed }, '[identify:episode] filename parsed');

    if (dbUrl) {
        const resolved = await resolveMetadata({ dbUrl, requestedType: 'episode' }).catch((error) => {
            logger.debug({ filePath, dbUrl, cause: error }, '[identify:episode] db url resolve failed');
            return null;
        });
        const resolvedEpisode = resolveEpisodeContext(resolved);
        const seasonNumber = parsed.seasonNumber ?? resolvedEpisode?.seasonNumber;
        const episodeNumber = parsed.episodeNumber ?? resolvedEpisode?.episodeNumber;

        if (resolvedEpisode?.tmdbShowId && seasonNumber && episodeNumber) {
            return fillEpisodeFromTMDBIds(resolvedEpisode.tmdbShowId, seasonNumber, episodeNumber);
        }
    }

    return episodeMetadataSchema.parse({
        type: 'episode',
        overview: null,
        rating: null,
        imdbId: null,
        tmdbShowId: null,
        ...parsed,
    });
};

const resolveEpisodeContext = (
    resolved: Awaited<ReturnType<typeof resolveMetadata>>
): { tmdbShowId: number; seasonNumber?: number; episodeNumber?: number } | null => {
    if (!resolved) return null;

    if (resolved.type === 'episode')
        return {
            tmdbShowId: resolved.tmdbShowId,
            seasonNumber: resolved.seasonNumber,
            episodeNumber: resolved.episodeNumber,
        };

    if (resolved.type === 'season')
        return {
            tmdbShowId: resolved.tmdbShowId,
            seasonNumber: resolved.seasonNumber,
        };

    if (resolved.type === 'series')
        return {
            tmdbShowId: resolved.tmdbShowId,
        };

    return null;
};

/**
 * Parses filename into episode number, name and season number.
 *
 * Supports:
 * - `Show.Name.S01E02.1080p...`
 * - `Show Name 1x05.mkv`
 * - `Show.Name.Season.1.Episode.02.mkv`
 */
export const parseEpisodeFilename = (filename: string): { name: string; seasonNumber: number | null; episodeNumber: number | null } => {
    const name = path.parse(filename).name;

    // 1. S01E02 format
    const stdFormat = name.match(/^(.+?)[.\s\-_]+S(\d{1,2})E(\d{1,3})/i);
    if (stdFormat && stdFormat[1] && stdFormat[2] && stdFormat[3]) {
        return {
            name: cleanTitle(stdFormat[1]),
            seasonNumber: parseInt(stdFormat[2]),
            episodeNumber: parseInt(stdFormat[3]),
        };
    }

    // 2. 1x05 format
    const xFormat = name.match(/^(.+?)[.\s\-_]+(\d{1,2})x(\d{1,3})/i);
    if (xFormat && xFormat[1] && xFormat[2] && xFormat[3]) {
        return {
            name: cleanTitle(xFormat[1]),
            seasonNumber: parseInt(xFormat[2]),
            episodeNumber: parseInt(xFormat[3]),
        };
    }

    // 3. "Season 1 Episode 2" format
    const longFormat = name.match(/^(.+?)[.\s\-_]+Season[.\s](\d{1,2})[.\s]Episode[.\s](\d{1,3})/i);
    if (longFormat && longFormat[1] && longFormat[2] && longFormat[3]) {
        return {
            name: cleanTitle(longFormat[1]),
            seasonNumber: parseInt(longFormat[2]),
            episodeNumber: parseInt(longFormat[3]),
        };
    }

    return { name: cleanTitle(name), seasonNumber: null, episodeNumber: null };
};

const cleanTitle = (title: string) => title.replace(/\./g, ' ').trim();
