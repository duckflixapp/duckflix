import { relations, type InferSelectModel } from 'drizzle-orm';
import { bigint, boolean, decimal, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type User = InferSelectModel<typeof users>;
export type UserWithoutPassword = Omit<User, 'password'>;

export const movies = pgTable(
    'movies',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        title: text('title').notNull(),
        description: text('description'),
        bannerUrl: text('banner_url'),
        posterUrl: text('poster_url'),
        rating: decimal('rating', { precision: 3, scale: 1 }).default('0.0'),
        releaseYear: integer('release_year'),
        duration: integer('duration'), // null while uploading or similar - seconds
        status: text('status').$type<'processing' | 'ready' | 'error'>().default('processing').notNull(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (table) => [index('title_idx').on(table.title), index('created_at_idx').on(table.createdAt)]
);

export const genres = pgTable('genres', {
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
            .references(() => genres.id, { onDelete: 'cascade' }),
    },
    (t) => [index('movie_genre_idx').on(t.movieId, t.genreId)]
);

export const movieVersions = pgTable('movie_versions', {
    id: uuid('id').defaultRandom().primaryKey(),
    movieId: uuid('movie_id')
        .notNull()
        .references(() => movies.id, { onDelete: 'cascade' }),
    width: integer('width'), // can be null while task is in process
    height: integer('height').notNull(),
    isOriginal: boolean('is_original').default(false).notNull(),
    status: text('status').$type<'waiting' | 'processing' | 'ready' | 'error'>().default('processing').notNull(),
    storageKey: text('storage_key').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }),
    mimeType: text('mime_type'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const moviesRelations = relations(movies, ({ one, many }) => ({
    user: one(users, {
        fields: [movies.userId],
        references: [users.id],
    }),
    versions: many(movieVersions),
    genres: many(moviesToGenres),
}));

export const genresRelations = relations(genres, ({ many }) => ({
    movies: many(moviesToGenres),
}));

export const moviesToGenresRelations = relations(moviesToGenres, ({ one }) => ({
    movie: one(movies, {
        fields: [moviesToGenres.movieId],
        references: [movies.id],
    }),
    genre: one(genres, {
        fields: [moviesToGenres.genreId],
        references: [genres.id],
    }),
}));

export const movieVersionsRelations = relations(movieVersions, ({ one }) => ({
    movie: one(movies, {
        fields: [movieVersions.movieId],
        references: [movies.id],
    }),
}));

export const notifications = pgTable('notifications', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id'),
    movieId: uuid('movie_id').references(() => movies.id, { onDelete: 'cascade' }),
    movieVerId: uuid('movie_version_id').references(() => movieVersions.id, { onDelete: 'cascade' }),
    type: text('type').$type<'info' | 'error' | 'success' | 'warning'>().default('info').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Movie = InferSelectModel<typeof movies>;
export type Genre = InferSelectModel<typeof genres>;
export type MovieVersion = InferSelectModel<typeof movieVersions>;
export type Notification = InferSelectModel<typeof notifications>;

export type NewMovieVersion = typeof movieVersions.$inferInsert;
