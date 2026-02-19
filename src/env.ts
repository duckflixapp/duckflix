import z from 'zod';
const envSchema = z.object({
    // Server
    PORT: z.coerce.number().default(3000),
    BASE_URL: z.url(),
    PROXIES: z.coerce.number().default(0),

    // Cookies & CORS
    DOMAIN: z.string(),
    ORIGIN: z.string().url(),

    // Configuration
    UPLOAD_FILE_LIMIT: z.coerce.number(), // U MB
    TEMP_FOLDER: z.string().min(1),
    STORAGE_FOLDER: z.string().min(1),

    // Database
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    // Authentication
    JWT_SECRET: z.string().min(24, 'JWT_SECRET must have at least 24 characters'),

    // External APIs
    RQBIT_URL: z.url(),
    TMDB_URL: z.url(),
    OPENSUBS_URL: z.url(),

    TMDB_API_KEY: z.string().optional(),
    OPENSUBS_USERNAME: z.string().optional(),
    OPENSUBS_PASSWORD: z.string().optional(),
    OPENSUBS_API_KEY: z.string().optional(),

    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
    console.error(
        'Invalid Environment variables:',
        result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
        }))
    );
    process.exit(1);
}

export const env = result.data;
