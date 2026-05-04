import { toEpisodeDTO } from '@shared/mappers/series.mapper';
import { SeasonEpisodeNotFound } from '../errors';
import type { EpisodeCastService, SeriesLogger, SeriesRepository } from '../series.ports';

type EpisodeServiceDependencies = {
    seriesRepository: SeriesRepository;
    episodeCastService: EpisodeCastService;
    logger: SeriesLogger;
};

export const createEpisodeService = ({ seriesRepository, episodeCastService, logger }: EpisodeServiceDependencies) => {
    const getEpisodeById = async (episodeId: string) => {
        const episode = await seriesRepository.findEpisodeById(episodeId);

        if (!episode) throw new SeasonEpisodeNotFound();

        const cast = await episodeCastService
            .getOrSyncEpisodeCast(episode.id, {
                seriesId: episode.season.series.tmdbId,
                seasonNumber: episode.season.seasonNumber,
                episodeNumber: episode.episodeNumber,
            })
            .catch((err) => {
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

    return {
        getEpisodeById,
    };
};

export type EpisodeService = ReturnType<typeof createEpisodeService>;
