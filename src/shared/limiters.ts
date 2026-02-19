import { ipKeyGenerator, type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from './redis';
import type { Request } from 'express';

const defaultConfig = (): Partial<Options> => {
    return {
        standardHeaders: true,
        legacyHeaders: false,
        store: new RedisStore({
            sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        }),
        keyGenerator: (req: Request) => {
            if (req.ip) return ipKeyGenerator(req.ip);
            return '';
        },
    };
};

export const limiterConfigs = {
    defaults: defaultConfig,
    authenticatedKey: (req: Request) => {
        if (req.user) return req.user.id!;
        if (req.ip) return ipKeyGenerator(req.ip);
        return '';
    },
};
