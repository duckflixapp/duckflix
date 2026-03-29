import { pgTable, uuid, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { movies } from './movie.schema';
import { users } from './user.schema';

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
        movieId: uuid('movie_id')
            .notNull()
            .references(() => movies.id, { onDelete: 'cascade' }),
        addedAt: timestamp('added_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    },
    (t) => [uniqueIndex('library_movie_unique_indx').on(t.libraryId, t.movieId)]
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
