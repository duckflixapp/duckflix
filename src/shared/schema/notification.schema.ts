import type { InferSelectModel } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { videos, videoVersions } from './video.schema';

// ------------------------------------
// Schema
// ------------------------------------
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

// ------------------------------------
// Types
// ------------------------------------
export type Notification = InferSelectModel<typeof notifications>;
