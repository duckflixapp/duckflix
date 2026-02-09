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

export type RegisterInput = z.infer<typeof registerSchema>;
