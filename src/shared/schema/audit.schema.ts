import type { InferSelectModel } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

// ------------------------------------
// Schema
// ------------------------------------
export const auditLogs = pgTable(
    'audit_logs',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
        action: text('action').notNull(),
        targetType: text('target_type').notNull(),
        targetId: text('target_id'),
        metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
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
