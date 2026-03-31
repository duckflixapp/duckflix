import type { VideoStatus, VideoType, VideoVersionStatus } from '@duckflix/shared';
import { pgTable, uuid, integer, text, timestamp, boolean, bigint } from 'drizzle-orm/pg-core';
import { relations, type InferSelectModel } from 'drizzle-orm';

import { users } from './user.schema';
import { movies } from './movie.schema';
import { seriesEpisodes } from './series.schema';

// ------------------------------------
// Schema
// ------------------------------------
export const videos = pgTable('videos', {
    id: uuid('id').defaultRandom().primaryKey(),
    uploaderId: uuid('uploader_id').references(() => users.id, { onDelete: 'set null' }),
    duration: integer('duration'), // null while uploading or similar - seconds
    status: text('status').$type<VideoStatus>().default('processing').notNull(),
    type: text('type').$type<VideoType>().notNull(),
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

// ------------------------------------
// Types
// ------------------------------------
export type Video = InferSelectModel<typeof videos>;
export type VideoVersion = InferSelectModel<typeof videoVersions>;
export type Subtitle = InferSelectModel<typeof subtitles>;

export type NewVideoVersion = typeof videoVersions.$inferInsert;

// ------------------------------------
// Relations
// ------------------------------------
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
    episode: one(seriesEpisodes),
    versions: many(videoVersions),
    subtitles: many(subtitles),
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
