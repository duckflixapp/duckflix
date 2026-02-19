import { env } from '../../env';

export const limits = {
    file: {
        upload: env.UPLOAD_FILE_LIMIT,
    },
} as const;
