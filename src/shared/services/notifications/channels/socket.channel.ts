import { socket } from '@server';
import type { NotificationChannel, NotificationEvent } from '../notification.types';

export class SocketChannel implements NotificationChannel {
    public async send(_senderId: string, events: NotificationEvent[]): Promise<void> {
        events.forEach((e) => socket.to(`user:${e.userId}`).emit('notification', e));
    }
}
