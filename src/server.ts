import http from 'node:http';
import { app } from '@core/app';
import { pool } from '@shared/configs/db';
import { SocketServer } from '@shared/lib/socket';
import { env } from '@core/env';
import { initalize } from '@core/initialize';
import { logger } from '@shared/configs/logger';
import { sessionRegistry } from '@modules/media/live.service';

const PORT = env.PORT;

const httpServer = http.createServer(app);
const socketServer = new SocketServer(httpServer);

await initalize();

export const io = socketServer.init();
const server = httpServer.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
    server.close();
    await pool.end();
    sessionRegistry.values().forEach((s) => s.destroy());
    process.exit(0);
});
