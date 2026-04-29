import { env } from '@core/env';
import Elysia from 'elysia';

type RequestIpServer = {
    requestIP: (request: Request) => { address: string } | null;
};

export const resolveClientIp = (request: Request, server?: RequestIpServer | null, trustedProxyCount = env.PROXIES) => {
    const xff = request.headers.get('x-forwarded-for');
    const socketIP = server?.requestIP(request)?.address ?? null;
    const xffIPs = xff
        ? xff
              .split(',')
              .map((ip) => ip.trim())
              .filter(Boolean)
        : [];
    const chain = socketIP ? [...xffIPs, socketIP] : xffIPs;
    const index = chain.length - 1 - trustedProxyCount;

    return chain[index] ?? chain[0] ?? null;
};

export const trustProxy = (trustedProxyCount = env.PROXIES) =>
    new Elysia({ name: 'trust-proxy' }).derive({ as: 'global' }, ({ request, server }) => {
        return { clientIp: resolveClientIp(request, server, trustedProxyCount) };
    });
