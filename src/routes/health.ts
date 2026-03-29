import { Router } from 'express';
import { db } from '@shared/configs/db';
import { sql } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';
import { limiterConfigs } from '@shared/limiters';
import { env } from '@core/env';

const router = Router();

const healthLimiter = rateLimit({
    ...limiterConfigs.defaults(),
    windowMs: 60 * 1000, // 50 per 1m
    max: 50,
    message: 'Health check rate limit exceeded',
});

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Check API health
 *     tags: [System]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 uptime:
 *                   type: string
 *                   example: 123s
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *                   example: 0.1.0
 *       503:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: unhealthy
 *                 reason:
 *                   type: string
 *                   example: Database connection failed
 */
router.get('/', healthLimiter, async (_req, res) => {
    try {
        await db.execute(sql`SELECT 1`);

        res.status(200).json({
            status: 'healthy',
            uptime: Math.floor(process.uptime()) + 's',
            timestamp: new Date().toISOString(),
            version: env.VERSION,
        });
    } catch {
        res.status(503).json({
            status: 'unhealthy',
            reason: 'Database connection failed',
        });
    }
});

export default router;
