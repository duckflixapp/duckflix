import pino, { type TransportTargetOptions } from 'pino';
import path from 'node:path';
import { paths } from './path.config';

const isProduction = process.env.NODE_ENV === 'production';

const targets: TransportTargetOptions[] = [];

targets.push({
    target: 'pino-pretty',
    level: 'debug',
    options: { ignore: 'pid,hostname,reqId,responseTime' },
});

if (isProduction)
    targets.push({
        target: 'pino-roll',
        level: 'warn',
        options: {
            file: path.join(paths.logs, '/app.log'),
            frequency: 'daily',
            size: '10m',
            mkdir: true,
        },
    });

const transport = pino.transport({ targets });

export const logger = pino({ level: isProduction ? 'info' : 'debug' }, transport);
