import type { UserRole } from '@duckflix/shared';
import { type InferSelectModel } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    verified_email: boolean('is_verified_email').notNull().default(false),
    password: text('password').notNull(),
    role: text('role').$type<UserRole>().default('watcher').notNull(),
    system: boolean('system').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export type User = InferSelectModel<typeof users>;
export type UserWithoutPassword = Omit<User, 'password'>;

export const sessions = pgTable('sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    isUsed: boolean('is_used').default(false).notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Session = InferSelectModel<typeof sessions>;

export type AccountTokenType = 'email_verification'; // email verification, phone verification, password reset
export const accountTokens = pgTable('account_tokens', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    type: text('type').$type<AccountTokenType>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type AccountToken = InferSelectModel<typeof accountTokens>;
