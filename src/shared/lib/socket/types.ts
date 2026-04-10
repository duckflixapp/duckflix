import z from 'zod';

export const notificationMessageScheme = z.object({
    userId: z.string(),
    type: z.enum(['info', 'success', 'error', 'warning']),
    title: z.string(),
    message: z.string(),
    videoId: z.string().nullable(),
    videoVerId: z.string().nullable(),
});

export const WSMessageSchema = z.union([
    z.object({
        event: z.literal('notification'),
        data: notificationMessageScheme,
    }),
    z.object({
        event: z.literal('video:progress'),
        data: z.object({
            status: z.enum(['downloading', 'processing', 'error']),
            versionId: z.string().optional(),
            progress: z.any(),
        }),
    }),
    z.object({
        event: z.literal('video:join'),
        data: z.string(),
    }),
    z.object({
        event: z.literal('video:leave'),
        data: z.string(),
    }),
]);

export type WSMessage = z.infer<typeof WSMessageSchema>;
