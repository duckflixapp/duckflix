import Elysia from 'elysia';
import { logger } from './logger';

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
};

const getStatusColor = (status: number) => {
    if (status >= 500) return colors.red;
    if (status >= 400) return colors.yellow;
    if (status >= 300) return colors.cyan;
    if (status >= 200) return colors.green;
    return colors.reset;
};

export const loggerPlugin = new Elysia()
    .state('startTime', 0)
    .derive({ as: 'global' }, ({ request, store }) => {
        if (request.method === 'OPTIONS') return;
        store.startTime = performance.now();
    })
    .onAfterResponse({ as: 'global' }, ({ request, set, store }) => {
        if (request.method === 'OPTIONS') return;

        const status = (set.status as number) ?? 200;
        const responseTime = Math.round(performance.now() - store.startTime);
        const path = new URL(request.url).pathname;

        const statusColor = getStatusColor(status);
        const methodColor = colors.bright + colors.cyan;

        logger.info(
            `${methodColor}${request.method}${colors.reset} ${path} ${statusColor}${status}${colors.reset} ${colors.gray}${responseTime}ms${colors.reset}`
        );
    });
