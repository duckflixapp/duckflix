import { env } from 'bun';
import cors from '@elysiajs/cors';

export const corsPlugin = cors({
    origin: ({ headers, url }) => {
        const origin = headers.get('origin');
        if ((!origin || origin === 'https://www.gstatic.com') && url.includes('/media/')) {
            return true; // wildcard
        }
        return origin === env.ORIGIN;
    },
    credentials: true,
});
