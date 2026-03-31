import { db } from '@shared/configs/db';
import { toSeriesDTO } from '@shared/mappers/series.mapper';
import { series, seriesSeasons } from '@schema/series.schema';
import { eq, sql } from 'drizzle-orm';
import { SeriesNotFound } from '../errors';

export const getSeriesById = async (seriesId: string) => {
    const tvSeries = await db.query.series.findFirst({
        where: eq(series.id, seriesId),
        with: {
            genres: { with: { genre: true } },
            seasons: {
                extras: {
                    episodeCount: sql<number>`(
                        SELECT COUNT(*) FROM series_episodes WHERE series_episodes.season_id = ${seriesSeasons.id}
                    )`.as('episode_count'),
                },
            },
        },
    });

    if (!tvSeries) throw new SeriesNotFound();
    return toSeriesDTO(tvSeries);
};

export const deleteSeriesById = async (data: { seriesId: string; userId: string }) => {
    await db.transaction(async (tx) => {
        const tvSeries = await tx.query.series.findFirst({ where: eq(series.id, data.seriesId) });
        if (!tvSeries) throw new SeriesNotFound();

        await tx.delete(series).where(eq(series.id, data.seriesId));
    });

    return;
};
