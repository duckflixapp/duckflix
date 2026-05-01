import z from 'zod';

export const resetPasswordSchema = z.object({
    password: z
        .string()
        .min(6, 'Password must be at least 6 characters')
        .max(64, 'Password must be less than 65 characters')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
});

export const sessionIdSchema = z.object({
    id: z.uuid(),
});

export const setupTotpSchema = z.object({
    code: z.string().length(6).regex(/^\d+$/),
});

export const markAccountNotificationsSchema = z.object({
    notificationIds: z.preprocess(
        (val) => (Array.isArray(val) ? val : []),
        z.array(z.uuid('Invalid Notification ID')).max(30, 'Too many Notifications, You can send [] to mark all')
    ),
});
