import { index, integer, text, uniqueIndex, sqliteTable, real } from 'drizzle-orm/sqlite-core';
import type { InferSelectModel } from 'drizzle-orm';
import { movies } from './movie.schema';
import { seriesEpisodes } from './series.schema';

export type CastCreditType = 'cast' | 'guest_star';

// ------------------------------------
// Schema
// ------------------------------------
export const casts = sqliteTable(
    'casts',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        tmdbId: integer('tmdb_id').notNull().unique(),
        name: text('name').notNull(),
        originalName: text('original_name'),
        gender: integer('gender'),
        knownForDepartment: text('known_for_department'),
        popularity: real('popularity'),
        profileUrl: text('profile_url'),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (t) => [index('casts_name_idx').on(t.name), index('casts_created_at_idx').on(t.createdAt)]
);

export const moviesToCasts = sqliteTable(
    'movies_to_casts',
    {
        movieId: text('movie_id')
            .notNull()
            .references(() => movies.id, { onDelete: 'cascade' }),
        castId: text('cast_id')
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

export const episodesToCasts = sqliteTable(
    'episodes_to_casts',
    {
        episodeId: text('episode_id')
            .notNull()
            .references(() => seriesEpisodes.id, { onDelete: 'cascade' }),
        castId: text('cast_id')
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
