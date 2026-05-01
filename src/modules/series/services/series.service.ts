import { db } from '@shared/configs/db';
import { toSeriesDetailedDTO } from '@shared/mappers/series.mapper';
import { series, seriesSeasons } from '@schema/series.schema';
import { and, count, eq, sql } from 'drizzle-orm';
import { SeriesNotFound } from '../errors';
import { libraries, libraryItems } from '@shared/schema';
import { createAuditLog } from '@shared/services/audit.service';

export const getSeriesById = async (seriesId: string, options: { accountId?: string }) => {
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

    let inLibrary: boolean | null = null;
    if (options.accountId) {
        const [libraryCount] = await db
            .select({ value: count() })
            .from(libraries)
            .leftJoin(libraryItems, eq(libraries.id, libraryItems.libraryId))
            .where(
                and(eq(libraries.type, 'watchlist'), eq(libraries.accountId, options.accountId), eq(libraryItems.seriesId, tvSeries.id))
            );

        inLibrary = !!libraryCount?.value && libraryCount?.value > 0;
    }

    return toSeriesDetailedDTO(tvSeries, inLibrary);
};

export const deleteSeriesById = async (data: { seriesId: string; accountId: string }) => {
    await db.transaction(async (tx) => {
        const tvSeries = await tx.query.series.findFirst({ where: eq(series.id, data.seriesId) });
        if (!tvSeries) throw new SeriesNotFound();

        await tx.delete(series).where(eq(series.id, data.seriesId));
        await createAuditLog(
            {
                actorAccountId: data.accountId,
                action: 'series.deleted',
                targetType: 'series',
                targetId: tvSeries.id,
                metadata: {
                    title: tvSeries.title,
                    tmdbId: tvSeries.tmdbId,
                },
            },
            tx
        );
    });

    return;
};
