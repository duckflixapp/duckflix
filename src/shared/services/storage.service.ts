import { sum } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { videoVersions } from '@shared/schema/video.schema';
import { formatBytes } from '@utils/formats';
import { env } from '@core/env';

export interface StorageStatistics {
    usedBytes: number; // int
    limitBytes: number; // int
    availableBytes: number; // int
    usedPercent: number; // float
    used: string; // .0 Unit
    limit: string; // .0 Unit
    available: string; // .0 Unit
}

export const getStorageStatistics = async (): Promise<StorageStatistics> => {
    const [result] = await db.select({ totalUsed: sum(videoVersions.fileSize) }).from(videoVersions);

    const usedBytes = result?.totalUsed ? parseInt(result.totalUsed) : 0;
    const limitBytes = env.STORAGE_LIMIT * 1_000_000; // MB -> B
    const availableBytes = Math.max(limitBytes - usedBytes, 0);
    const usedPercent = parseFloat(((usedBytes / limitBytes) * 100).toFixed(1));

    return {
        usedBytes,
        limitBytes,
        availableBytes,
        usedPercent,
        used: formatBytes(usedBytes, 2).display,
        limit: formatBytes(limitBytes, 2).display,
        available: formatBytes(availableBytes, 2).display,
    };
};
