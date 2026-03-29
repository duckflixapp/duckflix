import path from 'node:path';
import { computeHash, subtitlesClient } from '../../services/subs.service';
import { fillMovieFromTMDBId, searchTMDB } from '@shared/services/metadata/providers/tmdb.provider';
import { logger } from '@shared/configs/logger';
import type { MovieMetadata } from '@shared/services/metadata/metadata.service';

export const identifyMovie = async (filePath: string, fileName?: string, checkHash = true): Promise<MovieMetadata> => {
    if (checkHash) {
        const hash = await computeHash(filePath);
        const tmdbId = await findTmdbIdByHash(hash);
        logger.debug({ filePath, hash, tmdbId }, '[identify:movie] hash lookup');
        if (tmdbId) return fillMovieFromTMDBId(String(tmdbId));
    }

    const filename = fileName ?? path.basename(filePath);
    const parsed = parseMovieFilename(filename);

    logger.debug({ filePath, parsed }, '[identify:movie] filename parsed');

    const response = await searchTMDB(parsed);
    logger.debug({ filePath, total: response.total_results }, '[identify:movie] tmdb search');

    if (response.results[0]) return fillMovieFromTMDBId(String(response.results[0].id));

    return { type: 'movie', genres: [], imdbId: null, rating: null, ...parsed };
};

const findTmdbIdByHash = async (hash: string): Promise<number | null> => {
    const [subtitle] = await subtitlesClient.getSubtitles({ movieHash: hash, languages: ['en'] }, 0);
    return subtitle?.attributes.feature_details.tmdb_id ?? null;
};

/**
 * Parses a movie filename into title and release year.
 *
 * Supports common release formats:
 * - `Movie.Title.2026.1080p.WEBRip.x265.mkv`
 * - `Movie Title (2026) [1080p] [WEBRip] [YTS].mkv`
 * - `Movie.Title.BluRay.mkv` (no year)
 *
 * Strategy:
 * 1. Uses release year as a separator between title and technical tags
 * 2. Falls back to known tech tags (1080p, BluRay, x265...) if no year found
 * 3. If neither found, returns the full filename as title
 */
const parseMovieFilename = (filename: string): { title: string; releaseYear?: number } => {
    const name = path.parse(filename).name;

    // try year for separator
    const yearMatch = name.match(/^(.+?)[\.\s\(]+((?:19|20)\d{2})[\.\s\)]/);
    if (yearMatch && yearMatch[1] && yearMatch[2]) {
        return {
            title: yearMatch[1].replace(/\./g, ' ').trim(),
            releaseYear: parseInt(yearMatch[2]),
        };
    }

    // separate by tags
    const techTags = /[\.\s\[](2160p|1080p|720p|480p|BluRay|WEBRip|WEB-DL|HDTV|REMUX|x264|x265|HEVC|HDR)/i;
    const tagMatch = name.match(techTags);
    return {
        title: tagMatch
            ? name
                  .slice(0, tagMatch.index)
                  .replace(/[\.\[\]]/g, ' ')
                  .trim()
            : name.replace(/[\.\[\]]/g, ' ').trim(),
        releaseYear: undefined,
    };
};
