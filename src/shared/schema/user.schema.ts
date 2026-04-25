import type { UserRole } from '@duckflixapp/shared';
import { type InferSelectModel } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ------------------------------------
// Schema
// ------------------------------------
export const users = sqliteTable('users', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    verified_email: integer('is_verified_email', { mode: 'boolean' }).notNull().default(false),
    password: text('password').notNull(),
    role: text('role').$type<UserRole>().default('watcher').notNull(),
    system: integer('system', { mode: 'boolean' }).default(false).notNull(),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export const sessions = sqliteTable('sessions', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    isUsed: integer('is_used', { mode: 'boolean' }).default(false).notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export const accountTokens = sqliteTable('account_tokens', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    type: text('type').$type<AccountTokenType>().notNull(),
    expiresAt: text('expires_at').notNull(),
});

// ------------------------------------
// Types
// ------------------------------------
export type User = InferSelectModel<typeof users>;
export type UserWithoutPassword = Omit<User, 'password'>;

export type Session = InferSelectModel<typeof sessions>;

export type AccountToken = InferSelectModel<typeof accountTokens>;
export type AccountTokenType = 'email_verification'; // email verification, phone verification, password reset
