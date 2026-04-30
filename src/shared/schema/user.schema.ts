import type { UserRole } from '@duckflixapp/shared';
import { type InferSelectModel } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// ------------------------------------
// Schema
// ------------------------------------
export const accounts = sqliteTable('users', {
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

export const users = accounts;

export const sessions = sqliteTable(
    'sessions',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        accountId: text('user_id')
            .notNull()
            .references(() => accounts.id, { onDelete: 'cascade' }),
        token: text('token').notNull().unique(),
        userAgent: text('user_agent'),
        deviceName: text('device_name'),
        deviceType: text('device_type'),
        browserName: text('browser_name'),
        osName: text('os_name'),
        ipAddress: text('ip_address'),
        lastIpAddress: text('last_ip_address'),
        lastRefreshedAt: text('last_refreshed_at'),
        expiresAt: text('expires_at').notNull(),
        revokedAt: text('revoked_at'),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (t) => [index('session_user_id').on(t.accountId)]
);

export const accountTokens = sqliteTable('account_tokens', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    accountId: text('user_id')
        .notNull()
        .references(() => accounts.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    type: text('type').$type<AccountTokenType>().notNull(),
    expiresAt: text('expires_at').notNull(),
});

export const accountTotp = sqliteTable('account_totp', {
    accountId: text('account_id')
        .primaryKey()
        .references(() => accounts.id, { onDelete: 'cascade' }),
    secret: text('secret'),
    pendingSecret: text('pending_secret'),
    enabled: integer('enabled', { mode: 'boolean' }).default(false).notNull(),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export const totpBackupCodes = sqliteTable('totp_backup_codes', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    accountId: text('user_id')
        .notNull()
        .references(() => accounts.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: integer('used_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ------------------------------------
// Types
// ------------------------------------
export type Account = InferSelectModel<typeof accounts>;
export type User = Account;
export type UserWithoutPassword = Omit<User, 'password'>;

export type Session = InferSelectModel<typeof sessions>;

export type AccountToken = InferSelectModel<typeof accountTokens>;
export type AccountTotp = InferSelectModel<typeof accountTotp>;
export type AccountTokenType = 'email_verification' | 'login_challenge'; // email verification, phone verification, password reset
