import { AppError } from '../../../shared/errors';
import { fillFromTMDBUrl } from '../providers/tmdb.provider';
import { isVideoMetadata } from '../validators/metadata.validator';
import type { CreateMovieInput } from '../validators/movies.validator';

export interface VideoMetadata {
    title: string;
    overview?: string | null;
    releaseYear?: number | null;
    posterUrl?: string | null;
    bannerUrl?: string | null;
    genreIds: string[];
    imdbId: string | null;
}

export const fillFromUrl = async (url: string): Promise<Partial<VideoMetadata> | null> => {
    if (url.includes('themoviedb.org/movie')) return await fillFromTMDBUrl(url);
    return null;
};

export const enrichMetadata = async (url: string | undefined | null, manualData: CreateMovieInput): Promise<VideoMetadata> => {
    let externalData: Partial<VideoMetadata> = {};

    if (url) {
        const partialData = await fillFromUrl(url);
        if (partialData) externalData = partialData;
    }

    const enrichedMetadata = {
        title: externalData.title || manualData.title || '',
        overview: externalData.overview || manualData.overview || '',
        releaseYear: externalData.releaseYear || manualData.releaseYear || new Date().getFullYear(),
        posterUrl: externalData.posterUrl || manualData.posterUrl,
        bannerUrl: externalData.bannerUrl || manualData.bannerUrl,
        genreIds: externalData.genreIds?.length ? externalData.genreIds : manualData.genreIds || [],
        imdbId: externalData.imdbId ?? null,
    };

    if (!isVideoMetadata(enrichedMetadata)) throw new AppError('Failed to enrich metadata', { statusCode: 500 });

    return enrichedMetadata;
};
