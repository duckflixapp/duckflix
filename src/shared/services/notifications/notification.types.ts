export interface NotificationEvent {
    accountId: string;
    type: 'info' | 'success' | 'error' | 'warning';
    title: string;
    message: string;
    videoId: string | null;
    videoVerId: string | null;
}

export interface NotificationChannel {
    send(senderId: string, events: NotificationEvent[]): Promise<void>;
}
