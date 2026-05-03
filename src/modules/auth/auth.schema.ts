import { z } from 'zod';

export const registerSchema = z.object({
    email: z.email().toLowerCase().trim(),
    password: z
        .string()
        .min(6, 'Password must be at least 6 characters')
        .max(64, 'Password must be less than 65 characters')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
});

export const loginSchema = z.object({
    email: z.email(),
    password: z.string().max(64, 'Password must be less than 65 characters'),
});

const totpCredentialSchema = z.string().length(6).regex(/^\d+$/, 'Must be a 6-digit number');

export const loginChallengeSchema = z.discriminatedUnion('method', [
    z.object({
        challengeToken: z.string().min(1),
        method: z.literal('totp'),
        credential: totpCredentialSchema,
    }),
    z.object({
        challengeToken: z.string().min(1),
        method: z.literal('backup_code'),
        credential: z
            .string()
            .trim()
            .regex(/^[a-fA-F0-9]{8}$/, 'Must be an 8-character backup code'),
    }),
]);

export const verifyEmailSchema = z.object({
    token: z.string().min(1),
});

const stepUpSchemaBase = z.object({
    scope: z.enum(['sensitive:read', 'sensitive:write']),
});
export const stepUpSchema = z.discriminatedUnion('method', [
    stepUpSchemaBase.extend({
        method: z.literal('password'),
        credential: z.string().min(1),
    }),
    stepUpSchemaBase.extend({
        method: z.literal('totp'),
        credential: totpCredentialSchema,
    }),
]);

export type RegisterInput = z.infer<typeof registerSchema>;
