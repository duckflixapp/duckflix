import type { UserRole, VideoStatus, VideoType, VideoVersionStatus } from '@duckflix/shared';
import { relations, type InferSelectModel } from 'drizzle-orm';
import { bigint, boolean, decimal, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const systemSettings = pgTable('system_settings', {
    id: integer('id').primaryKey().default(1),
    settings: jsonb('settings')
        .$type<{
            features: {
                autoTranscoding: 'off' | 'compatibility' | 'smart';
                concurrentProcessing: number;
                registration: {
                    enabled: boolean; // is registration allowed
                    trustEmails: boolean; // verify users automatically
                };
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
    system: boolean('system').default(false).notNull(),
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

export const videos = pgTable('videos', {
    id: uuid('id').defaultRandom().primaryKey(),
    uploaderId: uuid('uploader_id').references(() => users.id, { onDelete: 'set null' }),
    duration: integer('duration'), // null while uploading or similar - seconds
    status: text('status').$type<VideoStatus>().default('processing').notNull(),
    type: text('type').$type<VideoType>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const subtitles = pgTable('subtitles', {
    id: uuid('id').defaultRandom().primaryKey(),
    videoId: uuid('video_id')
        .notNull()
        .references(() => videos.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    storageKey: text('storage_key').notNull(),
    externalId: text('external_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const videoVersions = pgTable('video_versions', {
    id: uuid('id').defaultRandom().primaryKey(),
    videoId: uuid('video_id')
        .notNull()
        .references(() => videos.id, { onDelete: 'cascade' }),
    width: integer('width'), // can be null while task is in process
    height: integer('height').notNull(),
    isOriginal: boolean('is_original').default(false).notNull(),
    status: text('status').$type<VideoVersionStatus>().default('processing').notNull(),
    storageKey: text('storage_key').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }),
    mimeType: text('mime_type'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const movies = pgTable('movies', {
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
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

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

export const videosRelations = relations(videos, ({ one, many }) => ({
    uploader: one(users, {
        fields: [videos.uploaderId],
        references: [users.id],
    }),
    movie: one(movies, {
        fields: [videos.id],
        references: [movies.videoId],
        relationName: 'movie_video',
    }),
    versions: many(videoVersions),
    subtitles: many(subtitles),
}));

export const moviesRelations = relations(movies, ({ one, many }) => ({
    video: one(videos, {
        fields: [movies.videoId],
        references: [videos.id],
        relationName: 'movie_video',
    }),
    genres: many(moviesToGenres),
}));

export const subtitlesRelations = relations(subtitles, ({ one }) => ({
    movie: one(videos, {
        fields: [subtitles.videoId],
        references: [videos.id],
    }),
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

export const videoVersionsRelations = relations(videoVersions, ({ one }) => ({
    movie: one(videos, {
        fields: [videoVersions.videoId],
        references: [videos.id],
    }),
}));

export const notifications = pgTable('notifications', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id'),
    videoId: uuid('video_id').references(() => videos.id, { onDelete: 'cascade' }),
    videoVerId: uuid('movie_version_id').references(() => videoVersions.id, { onDelete: 'cascade' }),
    type: text('type').$type<'info' | 'error' | 'success' | 'warning'>().default('info').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export type Movie = InferSelectModel<typeof movies>;
export type Video = InferSelectModel<typeof videos>;
export type Subtitle = InferSelectModel<typeof subtitles>;
export type Genre = InferSelectModel<typeof movieGenres>;
export type VideoVersion = InferSelectModel<typeof videoVersions>;
export type Notification = InferSelectModel<typeof notifications>;

export type NewVideoVersion = typeof videoVersions.$inferInsert;

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
