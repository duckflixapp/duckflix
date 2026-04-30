import type { InferSelectModel } from 'drizzle-orm';
import { text, sqliteTable, integer } from 'drizzle-orm/sqlite-core';
import { videos, videoVersions } from './video.schema';

// ------------------------------------
// Schema
// ------------------------------------
export const notifications = sqliteTable('notifications', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    accountId: text('user_id'),
    videoId: text('video_id').references(() => videos.id, { onDelete: 'cascade' }),
    videoVerId: text('movie_version_id').references(() => videoVersions.id, { onDelete: 'cascade' }),
    type: text('type').$type<'info' | 'error' | 'success' | 'warning'>().default('info').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

// ------------------------------------
// Types
// ------------------------------------
export type Notification = InferSelectModel<typeof notifications>;
