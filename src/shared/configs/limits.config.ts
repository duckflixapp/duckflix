import { env } from '@core/env';

export const limits = {
    file: {
        upload: env.UPLOAD_FILE_LIMIT,
        subtitle: 5 * 1024 * 1024, // 5MB maximum subtitle size
    },
    authentication: {
        session_expiry_ms: 28 * 24 * 60 * 60 * 1000, // 28 days
        access_token_expiry_ms: 5 * 60 * 1000, // 5 minutes
        login_max_failed_attempts: 12,
        login_window_ms: 60 * 1000, // 1 minute
        login_lockout_ms: 2 * 60 * 1000, // 2 minutes
        register_max_attempts: 10,
        register_window_ms: 60 * 1000, // 1 minute
        register_lockout_ms: 3 * 60 * 1000, // 3 minutes
    },
    profile: {
        limit: 10, // max profiles per account
        pin_max_failed_attempts: 5,
        pin_window_ms: 30 * 1000, // 30 seconds
        pin_lockout_ms: 30 * 1000, // 30 seconds
    },
} as const;
