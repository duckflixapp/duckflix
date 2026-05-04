import { env } from '@core/env';
import { liveSessionManager } from '@modules/media/live/live.service';
import { getStorageStatistics } from '@shared/services/storage.service';
import { createAuditLog, getAuditLogs } from '@shared/services/audit.service';
import { systemSettings } from '@shared/services/system.service';
import { taskHandler } from '@utils/taskHandler';
import { createAdminService } from './admin.service';
import { drizzleAdminRepository } from './admin.drizzle.repository';

export const adminService = createAdminService({
    adminRepository: drizzleAdminRepository,
    systemSettingsProvider: systemSettings,
    auditLogService: {
        createAuditLog,
        listAuditLogs: getAuditLogs,
    },
    storageStatisticsProvider: {
        getStorageStatistics,
    },
    taskStatisticsProvider: {
        getTaskStatistics: () => ({
            working: taskHandler.working,
            queue: taskHandler.queueSize,
        }),
    },
    liveSessionStatisticsProvider: {
        getLiveSessionStatistics: () => ({
            total: liveSessionManager.size(),
        }),
    },
    runtimeInfoProvider: {
        getVersion: () => env.VERSION,
        getUptime: () => process.uptime(),
    },
});
