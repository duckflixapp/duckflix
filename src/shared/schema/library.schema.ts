import { pgTable, uuid, text, integer, timestamp, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { movies } from './movie.schema';
import { users } from './user.schema';
import { series } from './series.schema';

// ------------------------------------
// Schema
// ------------------------------------
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

export const libraryItems = pgTable(
    'library_items',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        libraryId: uuid('library_id')
            .notNull()
            .references(() => libraries.id, { onDelete: 'cascade' }),
        movieId: uuid('movie_id').references(() => movies.id, { onDelete: 'cascade' }),
        seriesId: uuid('series_id').references(() => series.id, { onDelete: 'cascade' }),
        addedAt: timestamp('added_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex('library_movie_unique_idx').on(t.libraryId, t.movieId),
        uniqueIndex('library_series_unique_idx').on(t.libraryId, t.seriesId),
        check('content_xor', sql`(movie_id IS NOT NULL) <> (series_id IS NOT NULL)`),
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
