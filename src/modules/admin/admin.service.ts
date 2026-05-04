import { isAtLeast, roleHierarchy, roles, type AccountDTO, type SystemStatisticsDTO, type UserRole } from '@duckflixapp/shared';
import type { PaginatedResponse } from '@duckflixapp/shared';
import { AppError } from '@shared/errors';
import { toSystemStatisticsDTO } from '@shared/mappers/system.mapper';
import { toAccountDTO } from '@shared/mappers/user.mapper';
import type { AuditLogListItem } from '@shared/services/audit.service';
import type { SystemSettingsT } from '@shared/schema';
import {
    type AdminAuditLogService,
    type AdminLiveSessionStatisticsProvider,
    type AdminRepository,
    type AdminRuntimeInfoProvider,
    type AdminStorageStatisticsProvider,
    type AdminSystemSettingsProvider,
    type AdminTaskStatisticsProvider,
    type DeepPartial,
} from './admin.ports';

type AdminServiceDependencies = {
    adminRepository: AdminRepository;
    systemSettingsProvider: AdminSystemSettingsProvider;
    auditLogService: AdminAuditLogService;
    storageStatisticsProvider: AdminStorageStatisticsProvider;
    taskStatisticsProvider: AdminTaskStatisticsProvider;
    liveSessionStatisticsProvider: AdminLiveSessionStatisticsProvider;
    runtimeInfoProvider: AdminRuntimeInfoProvider;
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

export const createAdminService = ({
    adminRepository,
    systemSettingsProvider,
    auditLogService,
    storageStatisticsProvider,
    taskStatisticsProvider,
    liveSessionStatisticsProvider,
    runtimeInfoProvider,
}: AdminServiceDependencies) => {
    const getSystemSettings = async (): Promise<SystemSettingsT> => systemSettingsProvider.get();

    const getUsersWithRoles = async (): Promise<AccountDTO[]> => {
        const rolesIncluded = roles.filter((role) => isAtLeast(role, 'watcher'));
        const results = await adminRepository.listUsersWithRoles(rolesIncluded);

        return results.sort((a, b) => roleHierarchy[a.role] - roleHierarchy[b.role]).map(toAccountDTO);
    };

    const changeUserRole = async (email: string, role: UserRole, context: { accountId: string }): Promise<void> => {
        const result = await adminRepository.changeUserRole({ email, role, actorAccountId: context.accountId });

        if (result.status === 'not_found') throw new AppError('User not found, no changes were made', { statusCode: 404 });
        if (result.status === 'self_target') throw new AppError('You are not allowed to change your own role', { statusCode: 403 });
    };

    const deleteUser = async (email: string, context: { accountId: string }): Promise<void> => {
        const result = await adminRepository.deleteUser({ email, actorAccountId: context.accountId });

        if (result.status === 'not_found') throw new AppError('User not found, no changes were made', { statusCode: 404 });
        if (result.status === 'self_target') throw new AppError('You are not allowed to delete your own account', { statusCode: 403 });
    };

    const updateSystemSettings = async (
        settings: DeepPartial<SystemSettingsT>,
        context: { accountId: string }
    ): Promise<SystemSettingsT> => {
        const system = await systemSettingsProvider.update(settings);
        const summary = summarizeSystemSettingsPatch(settings);

        await auditLogService.createAuditLog({
            actorAccountId: context.accountId,
            action: 'admin.system.updated',
            targetType: 'system_settings',
            targetId: '1',
            metadata: summary,
        });

        return system;
    };

    const listAuditLogs = async (options: {
        page: number;
        limit: number;
        action?: string;
        actorAccountId?: string;
    }): Promise<PaginatedResponse<AuditLogListItem>> => auditLogService.listAuditLogs(options);

    const getSystemStatistics = async (): Promise<SystemStatisticsDTO> => {
        const storageStats = await storageStatisticsProvider.getStorageStatistics();
        const version = runtimeInfoProvider.getVersion();
        const uptime = runtimeInfoProvider.getUptime();
        const sessions = liveSessionStatisticsProvider.getLiveSessionStatistics();
        const tasks = taskStatisticsProvider.getTaskStatistics();

        return toSystemStatisticsDTO({ version, uptime, sessions, tasks, storage: storageStats });
    };

    return {
        changeUserRole,
        deleteUser,
        getSystemSettings,
        getSystemStatistics,
        getUsersWithRoles,
        listAuditLogs,
        updateSystemSettings,
    };
};

export type AdminService = ReturnType<typeof createAdminService>;
