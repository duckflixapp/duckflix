import { app } from '@core/app';
import { db } from '@shared/configs/db';
import { env } from '@core/env';
import { initalize } from '@core/initialize';
import { logger } from '@shared/configs/logger';
import { liveSessionManager } from '@modules/media/live.service';
import { socketPlugin } from '@core/socket';
import { Socket } from '@shared/lib/socket';

const PORT = env.PORT;
const HOSTNAME = env.HOSTNAME;

await initalize();

app.use(socketPlugin);

app.listen({ port: PORT, hostname: HOSTNAME }, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
});

export const socket = new Socket(app.server);

process.on('SIGINT', async () => {
    app.stop();
    db.$client.close();
    liveSessionManager.destroyAll();
    process.exit(0);
});
