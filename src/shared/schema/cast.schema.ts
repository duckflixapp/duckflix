import { decimal, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { InferSelectModel } from 'drizzle-orm';
import { movies } from './movie.schema';
import { seriesEpisodes } from './series.schema';

export type CastCreditType = 'cast' | 'guest_star';

// ------------------------------------
// Schema
// ------------------------------------
export const casts = pgTable(
    'casts',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        tmdbId: integer('tmdb_id').notNull().unique(),
        name: text('name').notNull(),
        originalName: text('original_name'),
        gender: integer('gender'),
        knownForDepartment: text('known_for_department'),
        popularity: decimal('popularity', { precision: 8, scale: 3 }),
        profileUrl: text('profile_url'),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    },
    (t) => [index('casts_name_idx').on(t.name), index('casts_created_at_idx').on(t.createdAt)]
);

export const moviesToCasts = pgTable(
    'movies_to_casts',
    {
        movieId: uuid('movie_id')
            .notNull()
            .references(() => movies.id, { onDelete: 'cascade' }),
        castId: uuid('cast_id')
            .notNull()
            .references(() => casts.id, { onDelete: 'cascade' }),
        creditId: text('credit_id').notNull(),
        type: text('type').$type<CastCreditType>().notNull().default('cast'),
        character: text('character'),
        order: integer('order'),
    },
    (t) => [
        uniqueIndex('movie_cast_credit_unique').on(t.movieId, t.creditId),
        index('movie_cast_movie_idx').on(t.movieId),
        index('movie_cast_cast_idx').on(t.castId),
    ]
);

export const episodesToCasts = pgTable(
    'episodes_to_casts',
    {
        episodeId: uuid('episode_id')
            .notNull()
            .references(() => seriesEpisodes.id, { onDelete: 'cascade' }),
        castId: uuid('cast_id')
            .notNull()
            .references(() => casts.id, { onDelete: 'cascade' }),
        creditId: text('credit_id').notNull(),
        type: text('type').$type<CastCreditType>().notNull().default('cast'),
        character: text('character'),
        order: integer('order'),
    },
    (t) => [
        uniqueIndex('episode_cast_credit_unique').on(t.episodeId, t.creditId),
        index('episode_cast_episode_idx').on(t.episodeId),
        index('episode_cast_cast_idx').on(t.castId),
    ]
);

// ------------------------------------
// Types
// ------------------------------------
export type Cast = InferSelectModel<typeof casts>;
