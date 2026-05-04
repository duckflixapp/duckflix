import { and, count, eq, sql } from 'drizzle-orm';

import { db } from '@shared/configs/db';
import { auditLogs, libraries, libraryItems, series, seriesEpisodes, seriesSeasons } from '@shared/schema';
import type { SeriesRepository } from './series.ports';

export const drizzleSeriesRepository: SeriesRepository = {
    async findSeriesById(seriesId: string) {
        return (
            (await db.query.series.findFirst({
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
            })) ?? null
        );
    },

    async countSeriesInWatchlist(data: { seriesId: string; profileId: string }) {
        const [libraryCount] = await db
            .select({ value: count() })
            .from(libraries)
            .leftJoin(libraryItems, eq(libraries.id, libraryItems.libraryId))
            .where(and(eq(libraries.type, 'watchlist'), eq(libraries.profileId, data.profileId), eq(libraryItems.seriesId, data.seriesId)));

        return libraryCount?.value ?? 0;
    },

    async deleteSeriesById(data: { seriesId: string; accountId: string }) {
        return db.transaction(async (tx) => {
            const tvSeries = await tx.query.series.findFirst({ where: eq(series.id, data.seriesId) });
            if (!tvSeries) return { status: 'not_found' };

            await tx.delete(series).where(eq(series.id, data.seriesId));
            await tx.insert(auditLogs).values({
                actorAccountId: data.accountId,
                action: 'series.deleted',
                targetType: 'series',
                targetId: tvSeries.id,
                metadata: {
                    title: tvSeries.title,
                    tmdbId: tvSeries.tmdbId,
                },
            });

            return {
                status: 'deleted',
                series: { id: tvSeries.id, title: tvSeries.title, tmdbId: tvSeries.tmdbId },
            };
        });
    },

    async findSeasonById(seasonId: string) {
        return (
            (await db.query.seriesSeasons.findFirst({
                where: eq(seriesSeasons.id, seasonId),
                with: {
                    series: true,
                    episodes: true,
                },
            })) ?? null
        );
    },

    async deleteSeasonById(data: { seasonId: string; accountId: string }) {
        return db.transaction(async (tx) => {
            const season = await tx.query.seriesSeasons.findFirst({
                where: eq(seriesSeasons.id, data.seasonId),
                with: {
                    series: {
                        columns: {
                            id: true,
                            title: true,
                        },
                    },
                },
            });
            if (!season) return { status: 'not_found' };

            await tx.delete(seriesSeasons).where(eq(seriesSeasons.id, data.seasonId));
            await tx.insert(auditLogs).values({
                actorAccountId: data.accountId,
                action: 'series.season.deleted',
                targetType: 'season',
                targetId: season.id,
                metadata: {
                    name: season.name,
                    seasonNumber: season.seasonNumber,
                    seriesId: season.series?.id ?? null,
                    seriesTitle: season.series?.title ?? null,
                },
            });

            return {
                status: 'deleted',
                season: {
                    id: season.id,
                    name: season.name,
                    seasonNumber: season.seasonNumber,
                    series: season.series ?? null,
                },
            };
        });
    },

    async findEpisodeById(episodeId: string) {
        return (
            (await db.query.seriesEpisodes.findFirst({
                where: eq(seriesEpisodes.id, episodeId),
                with: {
                    video: {
                        with: {
                            versions: true,
                            uploader: {
                                columns: {
                                    id: true,
                                    email: true,
                                    role: true,
                                    system: true,
                                },
                            },
                            subtitles: true,
                        },
                    },
                    season: {
                        with: {
                            series: true,
                        },
                    },
                },
            })) ?? null
        );
    },
};
