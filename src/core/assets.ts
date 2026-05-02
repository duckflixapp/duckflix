import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { logger } from '@shared/configs/logger';
import { paths } from '@shared/configs/path.config';

const bundledAssetsPath = path.resolve('assets');

export const initializeBundledAssets = async () => {
    await fs.mkdir(paths.public, { recursive: true });

    let entries: Dirent[];
    try {
        entries = await fs.readdir(bundledAssetsPath, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
    }

    const assetDirectories = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
    await Promise.all(
        assetDirectories.map((entry) =>
            fs.cp(path.join(bundledAssetsPath, entry.name), path.join(paths.public, entry.name), {
                recursive: true,
                force: true,
            })
        )
    );

    if (assetDirectories.length > 0) {
        logger.info({ count: assetDirectories.length, publicPath: paths.public }, 'Bundled assets initialized');
    }
};
