import { db } from '@shared/configs/db';
import { accounts, profiles } from '@schema/user.schema';
import { systemSettings } from '@shared/services/system.service';
import { logger } from '@shared/configs/logger';
import { checkHardwareDecoding } from '@shared/services/video';
import { initializeWatcher } from '@modules/videos/workflows/watcher.workflow';
import { fetchSystemAccountId, setSystemAccountId } from '@shared/configs/system';
import { recoverZombieMovies, recoverZombieProcesses } from './recovery';
import { seedDatabase } from './seeder';
import { filesCleanup } from './cleanup';
import { initializeBundledAssets } from './assets';
import { addonLoader } from '@modules/addons';

export const initalize = async () => {
    await systemSettings.update({}); // update with default settings

    // initialize system user
    const systemAccountId = await initializeSystemUser();

    // cleanup
    await filesCleanup();

    // initialize bundled public assets
    await initializeBundledAssets();

    // recovery
    await recoverZombieProcesses(systemAccountId);
    await recoverZombieMovies(systemAccountId);

    // seed genres if needed
    await seedDatabase();

    // check for hardware decoding
    await checkHardwareDecoding();

    // initialize watcher
    await initializeWatcher(systemAccountId);

    // initialize addons
    await addonLoader.loadExternalAddons();
    logger.info('System initialized successfully.');
};

const initializeSystemUser = async () => {
    const systemAccountId = await fetchSystemAccountId();
    if (systemAccountId) return systemAccountId;

    const account = await db.transaction(async (tx) => {
        const [account] = await tx.insert(accounts).values({ email: 'system', password: 'system', system: true }).returning();
        if (!account) throw new Error('Failed creating system user');

        await tx.insert(profiles).values({ accountId: account.id, name: 'system' });

        return account;
    });

    setSystemAccountId(account.id);
    return account.id;
};
