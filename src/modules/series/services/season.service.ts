import { toSeasonDTO } from '@shared/mappers/series.mapper';
import { SeriesSeasonNotFound } from '../errors';
import type { SeriesRepository } from '../series.ports';

type SeasonServiceDependencies = {
    seriesRepository: SeriesRepository;
};

export const createSeasonService = ({ seriesRepository }: SeasonServiceDependencies) => {
    const getSeasonById = async (seasonId: string) => {
        const season = await seriesRepository.findSeasonById(seasonId);

        if (!season) throw new SeriesSeasonNotFound();

        return toSeasonDTO(season);
    };

    const deleteSeasonById = async (data: { seasonId: string; accountId: string }) => {
        const result = await seriesRepository.deleteSeasonById(data);
        if (result.status === 'not_found') throw new SeriesSeasonNotFound();
    };

    return {
        deleteSeasonById,
        getSeasonById,
    };
};

export type SeasonService = ReturnType<typeof createSeasonService>;
