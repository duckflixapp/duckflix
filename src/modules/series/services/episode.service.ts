import { db } from '@shared/configs/db';
import { toEpisodeDTO } from '@shared/mappers/series.mapper';
import { seriesEpisodes } from '@schema/series.schema';
import { eq } from 'drizzle-orm';
import { SeasonEpisodeNotFound } from '../errors';
import { logger } from '@shared/configs/logger';
import { getOrSyncEpisodeCast } from '@shared/services/cast.service';

export const getEpisodeById = async (episodeId: string) => {
    const episode = await db.query.seriesEpisodes.findFirst({
        where: eq(seriesEpisodes.id, episodeId),
        with: {
            video: {
                with: {
                    versions: true,
                    uploader: true,
                    subtitles: true,
                },
            },
            season: {
                with: {
                    series: true,
                },
            },
        },
    });

    if (!episode) throw new SeasonEpisodeNotFound();

    const cast = await getOrSyncEpisodeCast(episode.id, {
        seriesId: episode.season.series.tmdbId,
        seasonNumber: episode.season.seasonNumber,
        episodeNumber: episode.episodeNumber,
    }).catch((err) => {
        logger.warn(
            {
                err,
                episodeId,
                tmdbEpisodeId: episode.tmdbId,
                tmdbSeriesId: episode.season.series.tmdbId,
            },
            'Failed to load episode cast'
        );
        return [];
    });

    return {
        ...toEpisodeDTO(episode),
        cast,
    };
};
