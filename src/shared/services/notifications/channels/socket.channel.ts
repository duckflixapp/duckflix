import type { NotificationChannel, NotificationEvent } from '../notification.types';

export class SocketChannel implements NotificationChannel {
    public async send(_senderId: string, events: NotificationEvent[]): Promise<void> {
        const { socket } = await import('@server');
        events.forEach((e) => socket.to(`user:${e.accountId}`).emit('notification', e));
    }
}
