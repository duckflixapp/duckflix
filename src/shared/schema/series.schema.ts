import { decimal, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations, type InferSelectModel } from 'drizzle-orm';

import { videos } from './video.schema';

export const series = pgTable('series', {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    overview: text('overview'),
    posterUrl: text('poster_url'),
    bannerUrl: text('banner_url'),
    rating: decimal('rating', { precision: 3, scale: 1 }),
    firstAirDate: text('first_air_date'),
    lastAirDate: text('last_air_date'),
    status: text('status').$type<'returning' | 'ended' | 'canceled' | 'in_production'>(),
    tmdbId: integer('tmdb_id').unique(),
    imdbId: text('imdb_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const seriesSeasons = pgTable(
    'series_seasons',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        seriesId: uuid('series_id')
            .notNull()
            .references(() => series.id, { onDelete: 'cascade' }),
        seasonNumber: integer('season_number').notNull(),
        name: text('name').notNull(),
        overview: text('overview'),
        posterUrl: text('poster_url'),
        airDate: text('air_date'),
        tmdbId: integer('tmdb_id').unique(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    },
    (t) => [uniqueIndex('series_season_unique').on(t.seriesId, t.seasonNumber)]
);

export const seriesEpisodes = pgTable(
    'series_episodes',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        seasonId: uuid('season_id')
            .notNull()
            .references(() => seriesSeasons.id, { onDelete: 'cascade' }),
        videoId: uuid('video_id')
            .notNull()
            .references(() => videos.id, { onDelete: 'cascade' }),
        episodeNumber: integer('episode_number').notNull(),
        name: text('name').notNull(),
        overview: text('overview'),
        airDate: text('air_date'),
        runtime: integer('runtime'),
        stillUrl: text('still_url'),
        rating: decimal('rating', { precision: 3, scale: 1 }),
        tmdbId: integer('tmdb_id').unique(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    },
    (t) => [uniqueIndex('season_episode_unique').on(t.seasonId, t.episodeNumber)]
);

// genres
export const seriesGenres = pgTable('series_genres', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
});

export const seriesToGenres = pgTable(
    'series_to_genres',
    {
        seriesId: uuid('series_id')
            .notNull()
            .references(() => series.id, { onDelete: 'cascade' }),
        genreId: uuid('genre_id')
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
