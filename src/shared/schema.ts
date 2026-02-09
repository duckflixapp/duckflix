import type { InferSelectModel } from 'drizzle-orm';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

export type User = InferSelectModel<typeof users>;
export type UserWithoutPassword = Omit<User, 'password'>;

export const movies = pgTable('movies', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    filePath: text('file_path').notNull(),
    thumbnail: text('thumbnail'),
    createdAt: timestamp('created_at').defaultNow(),
});
