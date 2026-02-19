import path from 'node:path';
import { env } from '../../env';

const ROOT_STORAGE = env.STORAGE_FOLDER;
const ROOT_TEMP = env.TEMP_FOLDER;

export const paths = {
    storage: path.resolve(ROOT_STORAGE),
    downloads: path.resolve(ROOT_TEMP, 'downloads/'),
    uploads: path.resolve(ROOT_TEMP, 'uploads/'),
} as const;
