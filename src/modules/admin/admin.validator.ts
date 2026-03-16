import { z } from 'zod';

export const changeUserRoleSchema = z.object({
    email: z.email(),
    role: z.enum(['watcher', 'contributor', 'admin']),
});

export const userSchema = z.object({
    email: z.email(),
});

export const systemSettingsUpdateSchema = z.object({
    features: z
        .object({
            autoTranscoding: z.enum(['off', 'compatibility', 'smart']).optional(),
            concurrentProcessing: z.number().min(1).max(10).optional(),
            registration: z
                .object({
                    enabled: z.boolean().optional(),
                    trustEmails: z.boolean().optional(),
                })
                .optional(),
        })
        .optional(),
    preferences: z
        .object({
            subtitles: z
                .array(
                    z.object({
                        lang: z.string(),
                        variants: z.number(),
                    })
                )
                .optional(),
        })
        .optional(),
    external: z
        .object({
            tmdb: z
                .object({
                    apiKey: z.string().optional(),
                })
                .optional(),
            openSubtitles: z
                .object({
                    apiKey: z.string().optional(),
                    username: z.string().optional(),
                    password: z.string().optional(),
                    useLogin: z.boolean().optional(),
                })
                .optional(),
            email: z
                .object({
                    enabled: z.boolean().optional(),
                    smtpSettings: z
                        .object({
                            host: z.string(),
                            port: z.number(),
                            username: z.string(),
                            password: z.string(),
                        })
                        .partial()
                        .optional(),
                })
                .optional(),
        })
        .optional(),
});
