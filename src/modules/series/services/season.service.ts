import { db } from '@shared/configs/db';
import { toSeasonDTO } from '@shared/mappers/series.mapper';
import { seriesSeasons } from '@schema/series.schema';
import { eq } from 'drizzle-orm';
import { SeriesSeasonNotFound } from '../errors';

export const getSeasonById = async (seasonId: string) => {
    const season = await db.query.seriesSeasons.findFirst({
        where: eq(seriesSeasons.id, seasonId),
        with: {
            episodes: true,
        },
    });

    if (!season) throw new SeriesSeasonNotFound();

    return toSeasonDTO(season);
};

export const deleteSeasonById = async (data: { seasonId: string; userId: string }) => {
    await db.transaction(async (tx) => {
        const season = await tx.query.seriesSeasons.findFirst({ where: eq(seriesSeasons.id, data.seasonId) });
        if (!season) throw new SeriesSeasonNotFound();

        await tx.delete(seriesSeasons).where(eq(seriesSeasons.id, data.seasonId));
    });

    return;
};
