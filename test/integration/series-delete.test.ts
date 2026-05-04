import { beforeEach, describe, expect, test } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { drizzleSeriesRepository } from '@modules/series/series.drizzle.repository';
import { db } from '@shared/configs/db';
import { accounts, auditLogs, series, seriesEpisodes, seriesSeasons, videos } from '@shared/schema';

const accountId = 'series-delete-account';
const seriesId = 'series-delete-series';
const seasonOneId = 'series-delete-season-1';
const seasonTwoId = 'series-delete-season-2';
const seasonOneVideoId = 'series-delete-video-1';
const seasonTwoVideoId = 'series-delete-video-2';

const resetFixtures = async () => {
    await db.delete(auditLogs);
    await db.delete(series);
    await db.delete(videos);
    await db.delete(accounts);

    await db.insert(accounts).values({
        id: accountId,
        email: 'series-delete@example.com',
        password: 'password',
        verified_email: true,
        role: 'admin',
    });

    await db.insert(series).values({
        id: seriesId,
        title: 'Integration Show',
        tmdbId: 10001,
    });

    await db.insert(seriesSeasons).values([
        {
            id: seasonOneId,
            seriesId,
            seasonNumber: 1,
            name: 'Season 1',
        },
        {
            id: seasonTwoId,
            seriesId,
            seasonNumber: 2,
            name: 'Season 2',
        },
    ]);

    await db.insert(videos).values([
        {
            id: seasonOneVideoId,
            duration: 120,
            status: 'ready',
            type: 'episode',
        },
        {
            id: seasonTwoVideoId,
            duration: 180,
            status: 'ready',
            type: 'episode',
        },
    ]);

    await db.insert(seriesEpisodes).values([
        {
            id: 'series-delete-episode-1',
            seasonId: seasonOneId,
            videoId: seasonOneVideoId,
            episodeNumber: 1,
            name: 'Episode 1',
        },
        {
            id: 'series-delete-episode-2',
            seasonId: seasonTwoId,
            videoId: seasonTwoVideoId,
            episodeNumber: 1,
            name: 'Episode 2',
        },
    ]);
};

const findVideos = async (...ids: string[]) =>
    await db
        .select({ id: videos.id })
        .from(videos)
        .where(inArray(videos.id, ids));

describe('series delete integration', () => {
    beforeEach(async () => {
        await resetFixtures();
    });

    test('deleting a season deletes videos for episodes in that season only', async () => {
        await expect(drizzleSeriesRepository.deleteSeasonById({ seasonId: seasonOneId, accountId })).resolves.toMatchObject({
            status: 'deleted',
        });

        expect(await findVideos(seasonOneVideoId, seasonTwoVideoId)).toEqual([{ id: seasonTwoVideoId }]);

        const remainingSeason = await db.query.seriesSeasons.findFirst({ where: eq(seriesSeasons.id, seasonOneId) });
        expect(remainingSeason).toBeUndefined();
    });

    test('deleting a series deletes videos for all episodes in the series', async () => {
        await expect(drizzleSeriesRepository.deleteSeriesById({ seriesId, accountId })).resolves.toMatchObject({
            status: 'deleted',
        });

        expect(await findVideos(seasonOneVideoId, seasonTwoVideoId)).toEqual([]);

        const remainingSeries = await db.query.series.findFirst({ where: eq(series.id, seriesId) });
        expect(remainingSeries).toBeUndefined();
    });
});
