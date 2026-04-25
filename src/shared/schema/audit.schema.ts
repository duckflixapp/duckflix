import type { InferSelectModel } from 'drizzle-orm';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './user.schema';

// ------------------------------------
// Schema
// ------------------------------------
export const auditLogs = sqliteTable(
    'audit_logs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
        action: text('action').notNull(),
        targetType: text('target_type').notNull(),
        targetId: text('target_id'),
        metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => [
        index('audit_logs_actor_user_id_idx').on(table.actorUserId),
        index('audit_logs_action_idx').on(table.action),
        index('audit_logs_created_at_idx').on(table.createdAt),
    ]
);

// ------------------------------------
// Types
// ------------------------------------
export type AuditLog = InferSelectModel<typeof auditLogs>;
