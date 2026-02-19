import { Server, Socket } from 'socket.io';
import http from 'node:http';
import { authenticateSocket } from '../middlewares/auth.middleware';
import { env } from '../../env';

export class SocketServer {
    private _io: Server;
    constructor(httpServer: http.Server) {
        this._io = new Server(httpServer, {
            cors: {
                origin: env.ORIGIN,
                credentials: true,
                methods: ['GET', 'POST'],
            },
            transports: ['websocket'],
        });
    }

    public get io() {
        return this._io;
    }

    public init() {
        this.io.use(authenticateSocket);

        this.io.on('connection', (socket: Socket) => {
            const userId = socket.data.userId;
            socket.join(`user:${userId}`);

            socket.on('movie:join', (movieId: string) => {
                if (movieId) socket.join(`movie:${movieId}`);
            });

            socket.on('movie:leave', (movieId: string) => {
                if (movieId) socket.leave(`movie:${movieId}`);
            });
        });

        return this.io;
    }
}
