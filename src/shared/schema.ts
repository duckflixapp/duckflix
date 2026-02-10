import { relations, type InferSelectModel } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type User = InferSelectModel<typeof users>;
export type UserWithoutPassword = Omit<User, 'password'>;

export const movies = pgTable(
    'movies',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        title: text('title').notNull(),
        status: text('status').$type<'processing' | 'ready' | 'error'>().default('processing').notNull(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (table) => [index('title_idx').on(table.title), index('created_at_idx').on(table.createdAt)]
);

export const movieVersions = pgTable('movie_versions', {
    id: uuid('id').defaultRandom().primaryKey(),
    movieId: uuid('movie_id')
        .notNull()
        .references(() => movies.id, { onDelete: 'cascade' }),
    width: integer('width'), // can be null while task is in process
    height: integer('height').notNull(),
    isOriginal: boolean('is_original').default(false).notNull(),
    status: text('status').$type<'processing' | 'ready' | 'error'>().default('processing').notNull(),
    storageKey: text('storage_key').notNull(),
    fileSize: bigint('file_size', { mode: 'number' }),
    mimeType: text('mime_type'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const moviesRelations = relations(movies, ({ one, many }) => ({
    user: one(users, {
        fields: [movies.userId],
        references: [users.id],
    }),
    versions: many(movieVersions),
}));

export const movieVersionsRelations = relations(movieVersions, ({ one }) => ({
    movie: one(movies, {
        fields: [movieVersions.movieId],
        references: [movies.id],
    }),
}));

export type Movie = InferSelectModel<typeof movies>;
export type MovieVersion = InferSelectModel<typeof movieVersions>;
export type NewMovieVersion = typeof movieVersions.$inferInsert;
