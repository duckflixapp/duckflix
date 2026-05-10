import { and, asc, count, desc, eq, exists, inArray, sql } from 'drizzle-orm';

import { db } from '@shared/configs/db';
import {
    auditLogs,
    libraries,
    libraryItems,
    series,
    seriesEpisodes,
    seriesSeasons,
    seriesToGenres,
    subtitles,
    videos,
} from '@shared/schema';
import type { SeriesRepository } from './series.ports';

const getOrderBy = (orderBy: string | null) => {
    switch (orderBy) {
        case 'oldest':
            return [asc(series.createdAt)];
        case 'rating':
            return [sql`cast(${series.rating} as decimal) DESC NULLS LAST`, desc(series.createdAt)];
        case 'title':
            return [asc(series.title)];
        case 'newest':
        default:
            return [desc(series.createdAt)];
    }
};

const richSeriesWith = {
    genres: { with: { genre: true } },
    seasons: {
        extras: {
            episodeCount: sql<number>`(
                SELECT COUNT(*) FROM series_episodes WHERE series_episodes.season_id = ${seriesSeasons.id}
            )`.as('episode_count'),
        },
    },
} as const;

export const drizzleSeriesRepository: SeriesRepository = {
    async list(options) {
        const offset = (options.page - 1) * options.limit;

        const searchFilter = options.q ? sql`lower(${series.title}) LIKE ${`%${options.q.toLowerCase()}%`}` : null;
        const genreFilter = options.genreId
            ? exists(
                  db
                      .select()
                      .from(seriesToGenres)
                      .where(and(eq(seriesToGenres.seriesId, series.id), eq(seriesToGenres.genreId, options.genreId)))
              )
            : null;

        const conditions = [searchFilter, genreFilter];
        const filters = and(...conditions.filter((condition) => condition != null));
        const orderBy = getOrderBy(options.orderBy ?? null);

        const [totalResult, results] = await Promise.all([
            db.select({ value: count() }).from(series).where(filters),
            db.query.series.findMany({
                where: filters,
                limit: options.limit,
                offset,
                orderBy,
                with: richSeriesWith,
            }),
        ]);

        if (!totalResult[0]) throw new Error('DB Count() failed');

        return {
            results,
            totalItems: Number(totalResult[0].value),
        };
    },

    async findSeriesById(seriesId: string) {
        return (
            (await db.query.series.findFirst({
                where: eq(series.id, seriesId),
                with: richSeriesWith,
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

            const toDelete = await tx
                .select({ id: videos.id, subtitleId: subtitles.id, subStorageKey: subtitles.storageKey })
                .from(videos)
                .leftJoin(subtitles, eq(videos.id, subtitles.videoId))
                .where(
                    inArray(
                        videos.id,
                        tx
                            .select({ videoId: seriesEpisodes.videoId })
                            .from(seriesEpisodes)
                            .innerJoin(seriesSeasons, eq(seriesEpisodes.seasonId, seriesSeasons.id))
                            .where(eq(seriesSeasons.seriesId, data.seriesId))
                    )
                );

            await tx
                .delete(videos)
                .where(
                    inArray(
                        videos.id,
                        tx
                            .select({ videoId: seriesEpisodes.videoId })
                            .from(seriesEpisodes)
                            .innerJoin(seriesSeasons, eq(seriesEpisodes.seasonId, seriesSeasons.id))
                            .where(eq(seriesSeasons.seriesId, data.seriesId))
                    )
                );
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
                deletedVideos: [...new Set(toDelete.map((v) => v.id))],
                deletedSubtitles: toDelete
                    .filter((v) => v.subtitleId && v.subStorageKey)
                    .map((v) => ({ id: v.subtitleId!, storageKey: v.subStorageKey! })),
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

            const toDelete = await tx
                .select({ id: videos.id, subtitleId: subtitles.id, subStorageKey: subtitles.storageKey })
                .from(videos)
                .leftJoin(subtitles, eq(videos.id, subtitles.videoId))
                .where(
                    inArray(
                        videos.id,
                        tx
                            .select({ videoId: seriesEpisodes.videoId })
                            .from(seriesEpisodes)
                            .where(eq(seriesEpisodes.seasonId, data.seasonId))
                    )
                );

            await tx
                .delete(videos)
                .where(
                    inArray(
                        videos.id,
                        tx
                            .select({ videoId: seriesEpisodes.videoId })
                            .from(seriesEpisodes)
                            .where(eq(seriesEpisodes.seasonId, data.seasonId))
                    )
                );

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
                deletedVideos: [...new Set(toDelete.map((v) => v.id))],
                deletedSubtitles: toDelete
                    .filter((v) => v.subtitleId && v.subStorageKey)
                    .map((v) => ({ id: v.subtitleId!, storageKey: v.subStorageKey! })),
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
