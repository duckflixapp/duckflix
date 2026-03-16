import type { UserRole } from '@duckflix/shared';
import { relations, type InferSelectModel } from 'drizzle-orm';
import { bigint, boolean, decimal, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const systemSettings = pgTable('system_settings', {
    id: integer('id').primaryKey().default(1),
    settings: jsonb('settings')
        .$type<{
            features: {
                autoTranscoding: 'off' | 'compatibility' | 'smart';
                concurrentProcessing: number;
                trustEmails: boolean; // verify users automatically
            };
            preferences: {
                subtitles: { lang: string; variants: number }[];
            };
            external: {
                tmdb: {
                    apiKey: string;
                };
                openSubtitles: {
                    apiKey: string;
                    username: string;
                    password: string;
                    useLogin: boolean;
                };
                email: {
                    enabled: boolean;
                    smtpSettings?: {
                        host: string;
                        port: number;
                        username: string;
                        password: string;
                    };
                };
            };
        }>()
        .notNull(),
});

export type SystemSettingsRow = InferSelectModel<typeof systemSettings>;
export type SystemSettingsT = SystemSettingsRow['settings'];

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    verified_email: boolean('is_verified_email').notNull().default(false),
    password: text('password').notNull(),
    role: text('role').$type<UserRole>().default('watcher').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export type User = InferSelectModel<typeof users>;
export type UserWithoutPassword = Omit<User, 'password'>;

export const sessions = pgTable('sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    isUsed: boolean('is_used').default(false).notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Session = InferSelectModel<typeof sessions>;

export type AccountTokenType = 'email_verification'; // email verification, phone verification, password reset
export const accountTokens = pgTable('account_tokens', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    type: text('type').$type<AccountTokenType>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type AccountToken = InferSelectModel<typeof accountTokens>;

export const movies = pgTable(
    'movies',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        uploaderId: uuid('uploader_id').references(() => users.id, { onDelete: 'set null' }),
        title: text('title').notNull(),
        description: text('description'),
        bannerUrl: text('banner_url'),
        posterUrl: text('poster_url'),
        rating: decimal('rating', { precision: 3, scale: 1 }).default('0.0'),
        releaseYear: integer('release_year'),
        duration: integer('duration'), // null while uploading or similar - seconds
        status: text('status').$type<'downloading' | 'processing' | 'ready' | 'error'>().default('processing').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    },
    (table) => [index('title_idx').on(table.title), index('created_at_idx').on(table.createdAt)]
);

export const subtitles = pgTable('subtitles', {
    id: uuid('id').defaultRandom().primaryKey(),
    movieId: uuid('movie_id')
        .notNull()
        .references(() => movies.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    storageKey: text('storage_key').notNull(),
    externalId: text('external_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

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
    status: text('status').$type<'waiting' | 'processing' | 'ready' | 'error' | 'canceled'>().default('processing').notNull(),
    storageKey: text('storage_key').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }),
    mimeType: text('mime_type'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const moviesRelations = relations(movies, ({ one, many }) => ({
    uploader: one(users, {
        fields: [movies.uploaderId],
        references: [users.id],
    }),
    versions: many(movieVersions),
    genres: many(moviesToGenres),
    subtitles: many(subtitles),
}));

export const subtitlesRelations = relations(subtitles, ({ one }) => ({
    movie: one(movies, {
        fields: [subtitles.movieId],
        references: [movies.id],
    }),
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
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export type Movie = InferSelectModel<typeof movies>;
export type Subtitle = InferSelectModel<typeof subtitles>;
export type Genre = InferSelectModel<typeof genres>;
export type MovieVersion = InferSelectModel<typeof movieVersions>;
export type Notification = InferSelectModel<typeof notifications>;

export type NewMovieVersion = typeof movieVersions.$inferInsert;

export const libraries = pgTable(
    'library',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        type: text('type').$type<'custom' | 'watchlist'>().default('custom').notNull(),
        size: integer('size').notNull().default(0),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    },
    (t) => [uniqueIndex('user_name_unique_key').on(t.userId, t.name)]
);

export type Library = typeof libraries.$inferSelect;

export const libraryItems = pgTable(
    'library_items',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        libraryId: uuid('library_id')
            .notNull()
            .references(() => libraries.id, { onDelete: 'cascade' }),
        movieId: uuid('movie_id')
            .notNull()
            .references(() => movies.id, { onDelete: 'cascade' }),
        addedAt: timestamp('added_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    },
    (t) => [uniqueIndex('library_movie_unique_indx').on(t.libraryId, t.movieId)]
);

export type LibraryItem = typeof libraryItems.$inferSelect;

export const libraryRelations = relations(libraries, ({ one }) => ({
    user: one(users, {
        fields: [libraries.userId],
        references: [users.id],
    }),
}));

export const libraryItemsRelations = relations(libraryItems, ({ one }) => ({
    movie: one(movies, {
        fields: [libraryItems.movieId],
        references: [movies.id],
    }),
}));
