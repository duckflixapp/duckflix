import path from 'node:path';
import { env } from '@core/env';

export const paths = {
    drop: path.resolve(env.DROP_FOLDER),
    storage: path.resolve(env.STORAGE_FOLDER),
    public: path.resolve(env.PUBLIC_FOLDER ?? path.join(env.STORAGE_FOLDER, 'public')),
    live: path.resolve(env.LIVE_FOLDER),
    addons: path.resolve(env.ADDONS_FOLDER),
    addonWorkspaces: path.resolve(env.TEMP_FOLDER, 'addons/'),
    downloads: path.resolve(env.TEMP_FOLDER, 'downloads/'),
    uploads: path.resolve(env.TEMP_FOLDER, 'uploads/'),
    logs: path.resolve(env.LOG_FOLDER),
} as const;
