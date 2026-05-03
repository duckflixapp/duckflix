import { text, integer, uniqueIndex, check, sqliteTable } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { movies } from './movie.schema';
import { profiles } from './user.schema';
import { series } from './series.schema';

// ------------------------------------
// Schema
// ------------------------------------
export const libraries = sqliteTable(
    'library',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        profileId: text('profile_id')
            .notNull()
            .references(() => profiles.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        type: text('type').$type<'custom' | 'watchlist'>().default('custom').notNull(),
        size: integer('size').notNull().default(0),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (t) => [uniqueIndex('profile_name_unique_key').on(t.profileId, t.name)]
);

export const libraryItems = sqliteTable(
    'library_items',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        libraryId: text('library_id')
            .notNull()
            .references(() => libraries.id, { onDelete: 'cascade' }),
        movieId: text('movie_id').references(() => movies.id, { onDelete: 'cascade' }),
        seriesId: text('series_id').references(() => series.id, { onDelete: 'cascade' }),
        addedAt: text('added_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (t) => [
        uniqueIndex('library_movie_unique_idx').on(t.libraryId, t.movieId),
        uniqueIndex('library_series_unique_idx').on(t.libraryId, t.seriesId),
        check('content_xor', sql`(movie_id IS NOT NULL) != (series_id IS NOT NULL)`),
    ]
);

// ------------------------------------
// Types
// ------------------------------------
export type Library = typeof libraries.$inferSelect;
export type LibraryItem = typeof libraryItems.$inferSelect;

// ------------------------------------
// Relations
// ------------------------------------
export const libraryRelations = relations(libraries, ({ one }) => ({
    profile: one(profiles, {
        fields: [libraries.profileId],
        references: [profiles.id],
    }),
}));

export const libraryItemsRelations = relations(libraryItems, ({ one }) => ({
    movie: one(movies, {
        fields: [libraryItems.movieId],
        references: [movies.id],
    }),
}));
