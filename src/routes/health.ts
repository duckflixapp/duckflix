import { Elysia, type Context } from 'elysia';
import { db } from '@shared/configs/db';
import { sql } from 'drizzle-orm';
import { env } from '@core/env';
import { createRateLimit } from '@shared/configs/ratelimit';

const healthController = async ({ set }: Context) => {
    try {
        db.run(sql`SELECT 1`);
        return {
            status: 'healthy',
            uptime: `${Math.floor(process.uptime())}s`,
            timestamp: new Date().toISOString(),
            version: env.VERSION,
        };
    } catch {
        set.status = 503;
        return {
            status: 'unhealthy',
            reason: 'Database connection failed',
        };
    }
};

export const healthRouter = new Elysia({ name: 'health', prefix: '/health' })
    .use(createRateLimit({ max: 30, duration: 3000 }))
    .get('/', healthController, {
        detail: { tags: ['Health'], summary: 'Details' },
    });
