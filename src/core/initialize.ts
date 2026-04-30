import { db } from '@shared/configs/db';
import { accounts, profiles } from '@schema/user.schema';
import { systemSettings } from '@shared/services/system.service';
import { logger } from '@shared/configs/logger';
import { checkHardwareDecoding } from '@shared/services/video';
import { initializeWatcher } from '@modules/videos/workflows/watcher.workflow';
import { fetchSystemUserId, setSystemUserId } from '@shared/configs/system';
import { recoverZombieMovies, recoverZombieProcesses } from './recovery';
import { seedDatabase } from './seeder';
import { filesCleanup } from './cleanup';

export const initalize = async () => {
    await systemSettings.update({}); // update with default settings

    // initialize system user
    const systemUserId = await initializeSystemUser();

    // cleanup
    await filesCleanup();

    // recovery
    await recoverZombieProcesses(systemUserId);
    await recoverZombieMovies(systemUserId);

    // seed genres if needed
    await seedDatabase();

    // check for hardware decoding
    await checkHardwareDecoding();

    // initialize watcher
    await initializeWatcher(systemUserId);
    logger.info('System initialized successfully.');
};

const initializeSystemUser = async () => {
    const systemUserId = await fetchSystemUserId();
    if (systemUserId) return systemUserId;

    const account = await db.transaction(async (tx) => {
        const [account] = await tx.insert(accounts).values({ email: 'system', password: 'system', system: true }).returning();
        if (!account) throw new Error('Failed creating system user');

        await tx.insert(profiles).values({ accountId: account.id, name: 'system' });

        return account;
    });

    setSystemUserId(account.id);
    return account.id;
};
