import { env } from '../../env';

export const limits = {
    file: {
        upload: env.UPLOAD_FILE_LIMIT,
    },
    authentication: {
        session_expiry_ms: 14 * 24 * 60 * 60 * 1000, // 14 days
        access_token_expiry_ms: 10 * 60 * 1000, // 10 minutes
    },
} as const;
