import { io } from '@server';
import type { NotificationChannel, NotificationEvent } from '../notification.types';

export class SocketChannel implements NotificationChannel {
    public async send(_senderId: string, events: NotificationEvent[]): Promise<void> {
        events.forEach((e) => io.to(`user:${e.userId}`).emit('notification', e));
    }
}
