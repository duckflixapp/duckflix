import fs from 'node:fs/promises';
import { paths } from '@shared/configs/path.config';
import path from 'node:path';

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
    await fs.mkdir(paths.downloads, { recursive: true });
    await clearFolderContentOnly(paths.downloads);

    await fs.mkdir(paths.uploads, { recursive: true });
    await clearFolderContentOnly(paths.uploads);
};

export const filesCleanup = async () => {
    await clearLiveFolder();
    await clearTempFolder();
};
