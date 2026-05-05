import type { AccountDTO, PaginatedResponse, UserRole } from '@duckflixapp/shared';
import type { SystemSettingsT } from '@shared/schema';
import type { AuditLogListItem } from '@shared/services/audit.service';
import type { StorageStatistics } from '@shared/services/storage.service';

export type DeepPartial<T> = {
    [K in keyof T]?: NonNullable<T[K]> extends Array<infer U>
        ? DeepPartial<U>[]
        : NonNullable<T[K]> extends object
          ? DeepPartial<NonNullable<T[K]>>
          : T[K];
};

export type AdminUserRecord = {
    id: string;
    email: string;
    verified_email: boolean;
    password: string;
    role: UserRole;
    system: boolean;
    createdAt: string;
    profiles?: {
        id: string;
        accountId: string;
        name: string;
        pinHash: string | null;
        createdAt: string;
    }[];
    totpEnabled?: boolean;
};

export type AdminUserMutationResult =
    | { status: 'changed'; user: { id: string; email: string; role: UserRole; previousRole?: UserRole } }
    | { status: 'not_found' }
    | { status: 'self_target' };

export interface AdminRepository {
    listUsersWithRoles(roles: UserRole[]): Promise<AdminUserRecord[]>;
    changeUserRole(data: { email: string; role: UserRole; actorAccountId: string }): Promise<AdminUserMutationResult>;
    deleteUser(data: { email: string; actorAccountId: string }): Promise<AdminUserMutationResult>;
}

export interface AdminSystemSettingsProvider {
    get(): Promise<SystemSettingsT>;
    update(settings: DeepPartial<SystemSettingsT>): Promise<SystemSettingsT>;
}

export interface AdminAuditLogService {
    createAuditLog(data: {
        actorAccountId?: string | null;
        action: string;
        targetType: string;
        targetId?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<void>;
    listAuditLogs(options: {
        page: number;
        limit: number;
        action?: string;
        actorAccountId?: string;
    }): Promise<PaginatedResponse<AuditLogListItem>>;
}

export interface AdminStorageStatisticsProvider {
    getStorageStatistics(): Promise<StorageStatistics>;
}

export interface AdminTaskStatisticsProvider {
    getTaskStatistics(): { working: number; queue: number };
}

export interface AdminLiveSessionStatisticsProvider {
    getLiveSessionStatistics(): { total: number };
}

export interface AdminRuntimeInfoProvider {
    getVersion(): string;
    getUptime(): number;
}

export type AdminUserListDTO = AccountDTO[];
