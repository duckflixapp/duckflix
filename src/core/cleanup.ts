import fs from 'node:fs/promises';
import { paths } from '@shared/configs/path.config';
import path from 'node:path';
import { db } from '@shared/configs/db';
import { videos } from '@shared/schema';
import { logger } from '@shared/configs/logger';
import { notInArray } from 'drizzle-orm';

const clearLiveFolder = async () => {
    try {
        const files = await fs.readdir(paths.live);
        await Promise.all(files.map((file) => fs.rm(path.join(paths.live, file), { recursive: true, force: true })));
    } catch {
        await fs.mkdir(paths.live, { recursive: true });
    }
};

const clearFolderContentOnly = async (dir: string) => {
    const files = await fs.readdir(dir);

    await Promise.all(files.map((file) => fs.rm(path.join(dir, file), { recursive: true, force: true }).catch(() => {})));
};

const clearTempFolder = async () => {
    await fs.mkdir(paths.addonWorkspaces, { recursive: true });
    await clearFolderContentOnly(paths.addonWorkspaces);

    await fs.mkdir(paths.downloads, { recursive: true });
    await clearFolderContentOnly(paths.downloads);

    await fs.mkdir(paths.uploads, { recursive: true });
    await clearFolderContentOnly(paths.uploads);
};

export const filesCleanup = async () => {
    await clearLiveFolder();
    await clearTempFolder();
};

const deleteZombieVideos = async () => {
    const existingVideos = await db.select({ id: videos.id }).from(videos);
    const existingVideoIds = existingVideos.map((v) => v.id);

    const dir = path.resolve(paths.storage, 'videos/');
    await fs.mkdir(dir, { recursive: true });
    const files = await fs.readdir(dir);

    const zombies = [];
    const validVideoIds = [];
    for (const file of files) {
        if (existingVideoIds.includes(file)) {
            validVideoIds.push(file);
            continue;
        }
        zombies.push(file);
    }

    if (zombies.length > 0) {
        logger.info({ zombies: zombies.length }, 'Cleaning zombies...');

        let deleted = 0;
        for (const file of zombies) {
            await fs
                .rm(path.join(dir, file), { recursive: true, force: true })
                .then(() => deleted++)
                .catch(() => {});
        }

        if (deleted > 0) {
            const failed = zombies.length - deleted;
            logger.info({ deleted, failed: failed > 0 ? failed : undefined }, 'Zombie videos cleaned.');
        }
    }

    return validVideoIds;
};

export const zombieCleanup = async () => {
    const validVideoIds = await deleteZombieVideos();

    const databaseDeleted = await db
        .delete(videos)
        .where(notInArray(videos.id, validVideoIds))
        .returning({ id: videos.id })
        .catch(() => logger.error('Failed to delete zombie videos in database'));

    if (databaseDeleted && databaseDeleted.length > 0) {
        logger.info({ deleted: databaseDeleted.length }, 'Delete zombie videos in database');
    }

    // TODO: delete zombie versions
};
