import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/shared/schema/index.ts',
    out: './drizzle',
    dialect: 'sqlite',
    verbose: true,
    strict: true,
    dbCredentials: {
        url: process.env.DATABASE_PATH!,
    },
});
