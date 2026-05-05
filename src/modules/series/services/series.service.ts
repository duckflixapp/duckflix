import { toSeriesDetailedDTO } from '@shared/mappers/series.mapper';
import { SeriesNotFound } from '../errors';
import type { SeriesRepository } from '../series.ports';

type SeriesServiceDependencies = {
    seriesRepository: SeriesRepository;
};

export const createSeriesService = ({ seriesRepository }: SeriesServiceDependencies) => {
    const getSeriesById = async (seriesId: string, options: { profileId?: string }) => {
        const tvSeries = await seriesRepository.findSeriesById(seriesId);

        if (!tvSeries) throw new SeriesNotFound();

        let inLibrary: boolean | null = null;
        if (options.profileId) {
            const libraryCount = await seriesRepository.countSeriesInWatchlist({
                seriesId: tvSeries.id,
                profileId: options.profileId,
            });

            inLibrary = libraryCount > 0;
        }

        return toSeriesDetailedDTO(tvSeries, inLibrary);
    };

    const deleteSeriesById = async (data: { seriesId: string; accountId: string }) => {
        const result = await seriesRepository.deleteSeriesById(data);
        if (result.status === 'not_found') throw new SeriesNotFound();
    };

    return {
        deleteSeriesById,
        getSeriesById,
    };
};

export type SeriesService = ReturnType<typeof createSeriesService>;
