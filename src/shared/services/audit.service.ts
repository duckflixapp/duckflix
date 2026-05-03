import type { PaginatedResponse, UserRole } from '@duckflixapp/shared';
import { and, count, desc, eq, like } from 'drizzle-orm';
import { db, type Transaction } from '@shared/configs/db';
import { accounts, auditLogs, profiles } from '@shared/schema';

type AuditClient = typeof db | Transaction;

type CreateAuditLogInput = {
    actorAccountId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
};

export type AuditLogListItem = {
    id: string;
    actorAccountId: string | null;
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
    actorAccountId?: string;
};

export const createAuditLog = async (data: CreateAuditLogInput, client: AuditClient = db): Promise<void> => {
    await client.insert(auditLogs).values({
        actorAccountId: data.actorAccountId ?? null,
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
        options.actorAccountId ? eq(auditLogs.actorAccountId, options.actorAccountId) : null,
    ];
    const filters = and(...conditions.filter((condition) => condition != null));

    const [totalResult, results] = await Promise.all([
        db.select({ value: count() }).from(auditLogs).where(filters),
        db
            .select({
                id: auditLogs.id,
                actorAccountId: auditLogs.actorAccountId,
                action: auditLogs.action,
                targetType: auditLogs.targetType,
                targetId: auditLogs.targetId,
                metadata: auditLogs.metadata,
                createdAt: auditLogs.createdAt,
                actorId: accounts.id,
                actorName: profiles.name,
                actorEmail: accounts.email,
                actorRole: accounts.role,
            })
            .from(auditLogs)
            .leftJoin(accounts, eq(auditLogs.actorAccountId, accounts.id))
            .leftJoin(profiles, eq(profiles.accountId, accounts.id))
            .where(filters)
            .orderBy(desc(auditLogs.createdAt))
            .limit(options.limit)
            .offset(offset),
    ]);

    const totalItems = Number(totalResult[0]?.value ?? 0);

    return {
        data: results.map((result) => ({
            id: result.id,
            actorAccountId: result.actorAccountId,
            actor:
                result.actorId && result.actorEmail && result.actorRole
                    ? {
                          id: result.actorId,
                          name: result.actorName ?? 'Unknown',
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
