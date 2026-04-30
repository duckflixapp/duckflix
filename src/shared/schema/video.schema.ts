import type { VideoStatus, VideoType, VideoVersionStatus } from '@duckflixapp/shared';
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations, type InferSelectModel } from 'drizzle-orm';

import { accounts } from './user.schema';
import { movies } from './movie.schema';
import { seriesEpisodes } from './series.schema';

// ------------------------------------
// Schema
// ------------------------------------
export const videos = sqliteTable('videos', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    uploaderId: text('uploader_id').references(() => accounts.id, { onDelete: 'set null' }),
    duration: integer('duration'),
    status: text('status').$type<VideoStatus>().default('processing').notNull(),
    type: text('type').$type<VideoType>().notNull(),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export const videoVersions = sqliteTable('video_versions', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    videoId: text('video_id')
        .notNull()
        .references(() => videos.id, { onDelete: 'cascade' }),
    width: integer('width'),
    height: integer('height').notNull(),
    isOriginal: integer('is_original', { mode: 'boolean' }).default(false).notNull(),
    status: text('status').$type<VideoVersionStatus>().default('processing').notNull(),
    storageKey: text('storage_key').notNull(),
    fileSize: integer('file_size'),
    mimeType: text('mime_type'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export const subtitles = sqliteTable('subtitles', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    videoId: text('video_id')
        .notNull()
        .references(() => videos.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    language: text('language').notNull(),
    storageKey: text('storage_key').notNull(),
    externalId: text('external_id'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export const watchHistory = sqliteTable(
    'watch_history',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        accountId: text('user_id')
            .notNull()
            .references(() => accounts.id, { onDelete: 'cascade' }),
        videoId: text('video_id')
            .notNull()
            .references(() => videos.id, { onDelete: 'cascade' }),
        lastPosition: integer('last_position').default(0).notNull(),
        isFinished: integer('is_finished', { mode: 'boolean' }).default(false).notNull(),
        updatedAt: text('updated_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [uniqueIndex('user_video_idx').on(table.accountId, table.videoId)]
);

// ------------------------------------
// Types
// ------------------------------------
export type Video = InferSelectModel<typeof videos>;
export type VideoVersion = InferSelectModel<typeof videoVersions>;
export type Subtitle = InferSelectModel<typeof subtitles>;
export type WatchHistory = InferSelectModel<typeof watchHistory>;

export type NewVideoVersion = typeof videoVersions.$inferInsert;

// ------------------------------------
// Relations
// ------------------------------------
export const videosRelations = relations(videos, ({ one, many }) => ({
    uploader: one(accounts, {
        fields: [videos.uploaderId],
        references: [accounts.id],
    }),
    movie: one(movies, {
        fields: [videos.id],
        references: [movies.videoId],
        relationName: 'movie_video',
    }),
    episode: one(seriesEpisodes),
    versions: many(videoVersions),
    subtitles: many(subtitles),
    watchHistory: many(watchHistory),
}));

export const videoVersionsRelations = relations(videoVersions, ({ one }) => ({
    video: one(videos, {
        fields: [videoVersions.videoId],
        references: [videos.id],
    }),
}));

export const subtitlesRelations = relations(subtitles, ({ one }) => ({
    video: one(videos, {
        fields: [subtitles.videoId],
        references: [videos.id],
    }),
}));

export const watchHistoryRelations = relations(watchHistory, ({ one }) => ({
    user: one(accounts, {
        fields: [watchHistory.accountId],
        references: [accounts.id],
    }),
    video: one(videos, {
        fields: [watchHistory.videoId],
        references: [videos.id],
    }),
}));
