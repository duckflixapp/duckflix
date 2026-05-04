import { logger } from '@shared/configs/logger';
import { getOrSyncEpisodeCast } from '@shared/services/cast.service';
import { createEpisodeService } from './services/episode.service';
import { createSeasonService } from './services/season.service';
import { createSeriesService } from './services/series.service';
import { drizzleSeriesRepository } from './series.drizzle.repository';

export const seriesService = createSeriesService({
    seriesRepository: drizzleSeriesRepository,
});

export const seasonService = createSeasonService({
    seriesRepository: drizzleSeriesRepository,
});

export const episodeService = createEpisodeService({
    seriesRepository: drizzleSeriesRepository,
    episodeCastService: {
        getOrSyncEpisodeCast,
    },
    logger,
});
