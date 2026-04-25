import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations, type InferSelectModel } from 'drizzle-orm';

import { videos } from './video.schema';

export type SeriesStatus = 'returning' | 'ended' | 'canceled' | 'in_production';

// ------------------------------------
// Schema
// ------------------------------------
export const series = sqliteTable(
    'series',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        title: text('title').notNull(),
        overview: text('overview'),
        posterUrl: text('poster_url'),
        bannerUrl: text('banner_url'),
        rating: real('rating'),
        firstAirDate: text('first_air_date'),
        lastAirDate: text('last_air_date'),
        status: text('status').$type<SeriesStatus>(),
        tmdbId: integer('tmdb_id').unique(),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (t) => [index('series_created_at_idx').on(t.createdAt), index('series_rating_idx').on(t.rating)]
);

export const seriesSeasons = sqliteTable(
    'series_seasons',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        seriesId: text('series_id')
            .notNull()
            .references(() => series.id, { onDelete: 'cascade' }),
        seasonNumber: integer('season_number').notNull(),
        name: text('name').notNull(),
        overview: text('overview'),
        posterUrl: text('poster_url'),
        airDate: text('air_date'),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (t) => [uniqueIndex('series_season_unique').on(t.seriesId, t.seasonNumber)]
);

export const seriesEpisodes = sqliteTable(
    'series_episodes',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        seasonId: text('season_id')
            .notNull()
            .references(() => seriesSeasons.id, { onDelete: 'cascade' }),
        videoId: text('video_id')
            .notNull()
            .references(() => videos.id, { onDelete: 'cascade' }),
        episodeNumber: integer('episode_number').notNull(),
        name: text('name').notNull(),
        overview: text('overview'),
        airDate: text('air_date'),
        runtime: integer('runtime'),
        stillUrl: text('still_url'),
        rating: real('rating'),
        tmdbId: integer('tmdb_id').unique(),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (t) => [uniqueIndex('season_episode_unique').on(t.seasonId, t.episodeNumber)]
);

// ----- Genres -----
export const seriesGenres = sqliteTable('series_genres', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull().unique(),
});

export const seriesToGenres = sqliteTable(
    'series_to_genres',
    {
        seriesId: text('series_id')
            .notNull()
            .references(() => series.id, { onDelete: 'cascade' }),
        genreId: text('genre_id')
            .notNull()
            .references(() => seriesGenres.id, { onDelete: 'cascade' }),
    },
    (t) => [index('series_genre_idx').on(t.seriesId, t.genreId)]
);

// ------------------------------------
// Types
// ------------------------------------
export type Series = InferSelectModel<typeof series>;
export type SeriesSeason = InferSelectModel<typeof seriesSeasons>;
export type SeriesEpisode = InferSelectModel<typeof seriesEpisodes>;
export type SeriesGenre = InferSelectModel<typeof seriesGenres>;

// ------------------------------------
// Relations
// ------------------------------------
export const seriesRelations = relations(series, ({ many }) => ({
    seasons: many(seriesSeasons),
    genres: many(seriesToGenres),
}));

export const seriesTogenresRelations = relations(seriesToGenres, ({ one }) => ({
    series: one(series, {
        fields: [seriesToGenres.seriesId],
        references: [series.id],
    }),
    genre: one(seriesGenres, {
        fields: [seriesToGenres.genreId],
        references: [seriesGenres.id],
    }),
}));

export const seriesSeasonsRelations = relations(seriesSeasons, ({ one, many }) => ({
    series: one(series, {
        fields: [seriesSeasons.seriesId],
        references: [series.id],
    }),
    episodes: many(seriesEpisodes),
}));

export const seriesEpisodesRelations = relations(seriesEpisodes, ({ one }) => ({
    season: one(seriesSeasons, {
        fields: [seriesEpisodes.seasonId],
        references: [seriesSeasons.id],
    }),
    video: one(videos, {
        fields: [seriesEpisodes.videoId],
        references: [videos.id],
    }),
}));
