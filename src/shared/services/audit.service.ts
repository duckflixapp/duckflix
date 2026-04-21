import type { PaginatedResponse, UserRole } from '@duckflixapp/shared';
import { and, count, desc, eq, like } from 'drizzle-orm';
import { db, type Transaction } from '@shared/configs/db';
import { auditLogs, users } from '@shared/schema';

type AuditClient = typeof db | Transaction;

type CreateAuditLogInput = {
    actorUserId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
};

export type AuditLogListItem = {
    id: string;
    actorUserId: string | null;
    actor: {
        id: string;
        name: string;
        email: string;
        role: UserRole;
    } | null;
    action: string;
    targetType: string;
    targetId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
};

type GetAuditLogsOptions = {
    page: number;
    limit: number;
    action?: string;
    actorUserId?: string;
};

export const createAuditLog = async (data: CreateAuditLogInput, client: AuditClient = db): Promise<void> => {
    await client.insert(auditLogs).values({
        actorUserId: data.actorUserId ?? null,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId ?? null,
        metadata: data.metadata ?? {},
    });
};

export const getAuditLogs = async (options: GetAuditLogsOptions): Promise<PaginatedResponse<AuditLogListItem>> => {
    const offset = (options.page - 1) * options.limit;

    const conditions = [
        options.action ? like(auditLogs.action, `${options.action}%`) : null,
        options.actorUserId ? eq(auditLogs.actorUserId, options.actorUserId) : null,
    ];
    const filters = and(...conditions.filter((condition) => condition != null));

    const [totalResult, results] = await Promise.all([
        db.select({ value: count() }).from(auditLogs).where(filters),
        db
            .select({
                id: auditLogs.id,
                actorUserId: auditLogs.actorUserId,
                action: auditLogs.action,
                targetType: auditLogs.targetType,
                targetId: auditLogs.targetId,
                metadata: auditLogs.metadata,
                createdAt: auditLogs.createdAt,
                actorId: users.id,
                actorName: users.name,
                actorEmail: users.email,
                actorRole: users.role,
            })
            .from(auditLogs)
            .leftJoin(users, eq(auditLogs.actorUserId, users.id))
            .where(filters)
            .orderBy(desc(auditLogs.createdAt))
            .limit(options.limit)
            .offset(offset),
    ]);

    const totalItems = Number(totalResult[0]?.value ?? 0);

    return {
        data: results.map((result) => ({
            id: result.id,
            actorUserId: result.actorUserId,
            actor:
                result.actorId && result.actorName && result.actorEmail && result.actorRole
                    ? {
                          id: result.actorId,
                          name: result.actorName,
                          email: result.actorEmail,
                          role: result.actorRole,
                      }
                    : null,
            action: result.action,
            targetType: result.targetType,
            targetId: result.targetId,
            metadata: result.metadata,
            createdAt: result.createdAt,
        })),
        meta: {
            totalItems,
            itemCount: results.length,
            itemsPerPage: options.limit,
            totalPages: Math.ceil(totalItems / options.limit),
            currentPage: options.page,
        },
    };
};
