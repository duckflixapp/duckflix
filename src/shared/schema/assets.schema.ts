import type { InferSelectModel } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export type AssetsType = 'profile_avatar';
export type AssetsSource = 'preset' | 'uploaded';

// ------------------------------------
// Schema
// ------------------------------------
export const assets = sqliteTable('assets', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    type: text('type').$type<AssetsType>().notNull(),
    source: text('source').$type<AssetsSource>().notNull(),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

// ------------------------------------
// Types
// ------------------------------------
export type Asset = InferSelectModel<typeof assets>;
