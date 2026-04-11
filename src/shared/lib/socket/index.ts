import { type WSMessage } from './types';

export class Socket {
    constructor(private readonly server: Bun.Server<unknown> | null) {}

    public to(room: string) {
        return {
            emit: <E extends WSMessage['event']>(event: E, data: Extract<WSMessage, { event: E }>['data']) => {
                if (!this.server) return;

                this.server.publish(room, JSON.stringify({ event, data }));
            },
        };
    }

    public emit<E extends WSMessage['event']>(event: E, data: Extract<WSMessage, { event: E }>['data']) {
        if (!this.server) return;

        this.server.publish('global', JSON.stringify({ event, data }));
    }
}
