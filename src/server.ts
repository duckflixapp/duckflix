import http from 'node:http';
import { app } from './app';
import { pool } from './shared/db';
import { SocketServer } from './shared/lib/socket';
import { env } from './env';

const PORT = env.PORT;

const httpServer = http.createServer(app);
const socketServer = new SocketServer(httpServer);

export const io = socketServer.init();

const server = httpServer.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
    server.close();
    await pool.end();
    process.exit(0);
});
