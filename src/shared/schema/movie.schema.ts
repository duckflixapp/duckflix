import { text, integer, index, sqliteTable, real } from 'drizzle-orm/sqlite-core';
import { videos } from './video.schema';
import { relations, type InferSelectModel } from 'drizzle-orm';

// ------------------------------------
// Schema
// ------------------------------------
export const movies = sqliteTable(
    'movies',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        videoId: text('video_id')
            .references(() => videos.id, { onDelete: 'cascade' })
            .notNull()
            .unique(),
        title: text('title').notNull(),
        overview: text('overview'),
        bannerUrl: text('banner_url'),
        posterUrl: text('poster_url'),
        rating: real('rating').default(0.0),
        releaseYear: integer('release_year'),
        runtime: integer('runtime'),
        tmdbId: integer('tmdb_id').unique(),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (t) => [index('movies_created_at_idx').on(t.createdAt), index('movies_rating_idx').on(t.rating)]
);

export const movieGenres = sqliteTable('movie_genres', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull().unique(),
});

export const moviesToGenres = sqliteTable(
    'movies_to_genres',
    {
        movieId: text('movie_id')
            .notNull()
            .references(() => movies.id, { onDelete: 'cascade' }),
        genreId: text('genre_id')
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
