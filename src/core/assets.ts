import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { logger } from '@shared/configs/logger';
import { paths } from '@shared/configs/path.config';
import { db } from '@shared/configs/db';
import { assets } from '@shared/schema/assets.schema';
import { isNotNull } from 'drizzle-orm';

const bundledAssetsPath = path.resolve('assets');

const allowedExts = ['jpg', 'jpeg', 'webp', 'png', 'gif', 'svg'];

const getExtension = (file: string) => {
    const parts = file.split('.');
    if (parts.length === 0) return null;
    return parts[parts.length - 1] ?? null;
};

export const initializeBundledAssets = async () => {
    await fs.mkdir(paths.public, { recursive: true });

    let entries: Dirent[];
    try {
        entries = await fs.readdir(bundledAssetsPath, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
    }

    const savedAssets = await db.select({ name: assets.originalName }).from(assets).where(isNotNull(assets.originalName));
    const savedAssetsNames = savedAssets.map((a) => a.name);

    const files = entries
        .filter((entry) => !entry.isDirectory() && !entry.name.startsWith('.'))
        .filter((e) => allowedExts.includes(getExtension(e.name) ?? ''))
        .filter((e) => !savedAssetsNames.includes(e.name));

    const successfull = await Promise.allSettled(
        files.map((entry) =>
            db.transaction(async (tx) => {
                const id = crypto.randomUUID();
                const ext = getExtension(entry.name);
                const storageKey = id + (ext ? '.' + ext : '');
                await tx.insert(assets).values({
                    id,
                    type: 'profile_avatar',
                    source: 'preset',
                    storageKey,
                    originalName: entry.name,
                });
                return fs.cp(path.join(bundledAssetsPath, entry.name), path.join(paths.public, storageKey), {
                    recursive: true,
                    force: true,
                });
            })
        )
    ).then((r) => r.filter((p) => p.status === 'fulfilled').length);

    if (files.length > 0) {
        logger.info({ count: successfull, failed: files.length - successfull, publicPath: paths.public }, 'Bundled assets initialized');
    }
};
