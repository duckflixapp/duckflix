import { env } from '@core/env';

export const limits = {
    file: {
        upload: env.UPLOAD_FILE_LIMIT,
    },
    authentication: {
        session_expiry_ms: 14 * 24 * 60 * 60 * 1000, // 14 days
        access_token_expiry_ms: 10 * 60 * 1000, // 10 minutes
        login_max_failed_attempts: 12,
        login_window_ms: 60 * 1000, // 1 minute
        login_lockout_ms: 2 * 60 * 1000, // 2 minutes
        register_max_attempts: 10,
        register_window_ms: 60 * 1000, // 1 minute
        register_lockout_ms: 3 * 60 * 1000, // 3 minutes
    },
} as const;
