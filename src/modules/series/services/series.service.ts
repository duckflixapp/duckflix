import type { PaginatedResponse, SeriesDTO } from '@duckflixapp/shared';

import { toSeriesDetailedDTO, toSeriesDTO } from '@shared/mappers/series.mapper';
import { SeriesNotFound } from '../errors';
import type { SeriesRepository } from '../series.ports';
import { deleteVideosById } from './video.service';

type SeriesServiceDependencies = {
    seriesRepository: SeriesRepository;
};

export const createSeriesService = ({ seriesRepository }: SeriesServiceDependencies) => {
    const getSeries = async (options: {
        page: number;
        limit: number;
        search?: string;
        orderBy?: string;
        genreId?: string;
    }): Promise<PaginatedResponse<SeriesDTO>> => {
        const { results, totalItems } = await seriesRepository.list(options);

        return {
            data: results.map(toSeriesDTO),
            meta: {
                totalItems,
                itemCount: results.length,
                itemsPerPage: options.limit,
                totalPages: Math.ceil(totalItems / options.limit),
                currentPage: options.page,
            },
        };
    };

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
        await deleteVideosById(result.deletedVideos, result.deletedSubtitles);
    };

    return {
        deleteSeriesById,
        getSeries,
        getSeriesById,
    };
};

export type SeriesService = ReturnType<typeof createSeriesService>;
