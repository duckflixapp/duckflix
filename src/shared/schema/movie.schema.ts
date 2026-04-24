import { pgTable, uuid, text, decimal, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { videos } from './video.schema';
import { relations, sql, type InferSelectModel } from 'drizzle-orm';

// ------------------------------------
// Schema
// ------------------------------------
export const movies = pgTable(
    'movies',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        videoId: uuid('video_id')
            .references(() => videos.id, { onDelete: 'cascade' })
            .notNull()
            .unique(),
        title: text('title').notNull(),
        overview: text('overview'),
        bannerUrl: text('banner_url'),
        posterUrl: text('poster_url'),
        rating: decimal('rating', { precision: 3, scale: 1 }).default('0.0'),
        releaseYear: integer('release_year'),
        runtime: integer('runtime'),
        tmdbId: integer('tmdb_id').unique(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    },
    (t) => [
        index('movies_created_at_idx').on(t.createdAt),
        index('movies_rating_idx').on(t.rating),
        index('movies_fts_idx').using(
            'gin',
            sql`(setweight(to_tsvector('english', ${t.title}), 'A') || 
            setweight(to_tsvector('english', coalesce(${t.overview}, '')), 'B'))`
        ),
    ]
);

export const movieGenres = pgTable('movie_genres', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
});

// pivot table
export const moviesToGenres = pgTable(
    'movies_to_genres',
    {
        movieId: uuid('movie_id')
            .notNull()
            .references(() => movies.id, { onDelete: 'cascade' }),
        genreId: uuid('genre_id')
            .notNull()
            .references(() => movieGenres.id, { onDelete: 'cascade' }),
    },
    (t) => [index('movie_genre_idx').on(t.movieId, t.genreId)]
);

// ------------------------------------
// Types
// ------------------------------------
export type Movie = InferSelectModel<typeof movies>;
export type Genre = InferSelectModel<typeof movieGenres>;

// ------------------------------------
// Relations
// ------------------------------------
export const moviesRelations = relations(movies, ({ one, many }) => ({
    video: one(videos, {
        fields: [movies.videoId],
        references: [videos.id],
        relationName: 'movie_video',
    }),
    genres: many(moviesToGenres),
}));

export const genresRelations = relations(movieGenres, ({ many }) => ({
    movies: many(moviesToGenres),
}));

export const moviesToGenresRelations = relations(moviesToGenres, ({ one }) => ({
    movie: one(movies, {
        fields: [moviesToGenres.movieId],
        references: [movies.id],
    }),
    genre: one(movieGenres, {
        fields: [moviesToGenres.genreId],
        references: [movieGenres.id],
    }),
}));
