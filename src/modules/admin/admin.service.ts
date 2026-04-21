import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { users } from '@schema/user.schema';
import { toUserDTO } from '@shared/mappers/user.mapper';
import { isAtLeast, roleHierarchy, roles, type SystemStatisticsDTO, type UserDTO, type UserRole } from '@duckflixapp/shared';
import { AppError } from '@shared/errors';
import { getStorageStatistics } from '@shared/services/storage.service';
import { toSystemStatisticsDTO } from '@shared/mappers/system.mapper';
import { env } from '@core/env';
import { taskHandler } from '@utils/taskHandler';
import { liveSessionManager } from '@modules/media/live.service';
import { createAuditLog } from '@shared/services/audit.service';
import { systemSettings } from '@shared/services/system.service';
import type { SystemSettingsT } from '@shared/schema';

type DeepPartial<T> = {
    [K in keyof T]?: NonNullable<T[K]> extends Array<infer U>
        ? DeepPartial<U>[]
        : NonNullable<T[K]> extends object
          ? DeepPartial<NonNullable<T[K]>>
          : T[K];
};

const SENSITIVE_SYSTEM_SETTING_PATHS = new Set([
    'external.tmdb.apiKey',
    'external.openSubtitles.apiKey',
    'external.openSubtitles.password',
    'external.email.smtpSettings.password',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const collectPatchPaths = (value: unknown, prefix = ''): string[] => {
    if (!isRecord(value)) return prefix ? [prefix] : [];

    const entries = Object.entries(value);
    if (entries.length === 0) return prefix ? [prefix] : [];

    return entries.flatMap(([key, nestedValue]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (Array.isArray(nestedValue) || !isRecord(nestedValue)) return [path];
        return collectPatchPaths(nestedValue, path);
    });
};

const summarizeSystemSettingsPatch = (patch: unknown) => {
    const paths = [...new Set(collectPatchPaths(patch))];

    return {
        updatedPaths: paths.filter((path) => !SENSITIVE_SYSTEM_SETTING_PATHS.has(path)),
        sensitivePathsUpdated: paths.filter((path) => SENSITIVE_SYSTEM_SETTING_PATHS.has(path)),
    };
};

export const getUsersWithRoles = async (): Promise<UserDTO[]> => {
    const rolesIncluded = roles.filter((r) => isAtLeast(r, 'watcher'));
    const results = await db
        .select()
        .from(users)
        .where(and(inArray(users.role, rolesIncluded), eq(users.system, false)));

    return results.sort((a, b) => roleHierarchy[a.role] - roleHierarchy[b.role]).map(toUserDTO);
};

export const changeUserRole = async (email: string, role: UserRole, context: { userId: string }): Promise<void> => {
    return await db.transaction(async (tx) => {
        const [user] = await tx
            .select({ id: users.id, email: users.email, role: users.role })
            .from(users)
            .where(and(eq(users.email, email), eq(users.system, false)));
        if (!user) throw new AppError('User not found, no changes were made', { statusCode: 404 });
        if (user.id == context.userId) throw new AppError('You are not allowed to change your own role', { statusCode: 403 });

        await tx.update(users).set({ role }).where(eq(users.id, user.id));
        await createAuditLog(
            {
                actorUserId: context.userId,
                action: 'admin.user.role_changed',
                targetType: 'user',
                targetId: user.id,
                metadata: {
                    email: user.email,
                    previousRole: user.role,
                    nextRole: role,
                },
            },
            tx
        );
    });
};

export const deleteUser = async (email: string, context: { userId: string }): Promise<void> => {
    return await db.transaction(async (tx) => {
        const [user] = await tx
            .select({ id: users.id, email: users.email, role: users.role })
            .from(users)
            .where(and(eq(users.email, email), eq(users.system, false)));
        if (!user) throw new AppError('User not found, no changes were made', { statusCode: 404 });
        if (user.id == context.userId) throw new AppError('You are not allowed to delete your own account', { statusCode: 403 });

        await tx.delete(users).where(eq(users.id, user.id));
        await createAuditLog(
            {
                actorUserId: context.userId,
                action: 'admin.user.deleted',
                targetType: 'user',
                targetId: user.id,
                metadata: {
                    email: user.email,
                    role: user.role,
                },
            },
            tx
        );
    });
};

export const updateSystemSettings = async (
    settings: DeepPartial<SystemSettingsT>,
    context: { userId: string }
): Promise<SystemSettingsT> => {
    const system = await systemSettings.update(settings);
    const summary = summarizeSystemSettingsPatch(settings);

    await createAuditLog({
        actorUserId: context.userId,
        action: 'admin.system.updated',
        targetType: 'system_settings',
        targetId: '1',
        metadata: summary,
    });

    return system;
};

export const getSystemStatistics = async (): Promise<SystemStatisticsDTO> => {
    const storageStats = await getStorageStatistics();
    const version = env.VERSION;
    const uptime = process.uptime();

    const sessions = {
        total: liveSessionManager.size(),
    };

    const tasks = {
        working: taskHandler.working,
        queue: taskHandler.queueSize,
    };

    return toSystemStatisticsDTO({ version, uptime, sessions, tasks, storage: storageStats });
};
