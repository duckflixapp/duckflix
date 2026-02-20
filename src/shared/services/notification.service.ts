import { db } from '../configs/db';
import { notifications } from '../schema';
import { io } from '../../server';

const notifyUser = (userId: string, data: unknown) => {
    io.to(`user:${userId}`).emit('notification', data);
};

const notifyJobStatus = async (
    userId: string,
    status: 'started' | 'completed' | 'downloaded' | 'error',
    title: string,
    message: string,
    movieId?: string,
    movieVerId?: string
) => {
    const typeMap = {
        completed: 'success',
        error: 'error',
        started: 'info',
        downloaded: 'info',
    } as const;

    const finalType = typeMap[status] || 'info';

    db.insert(notifications)
        .values({
            userId: userId,
            movieId: movieId,
            movieVerId: movieVerId,
            type: finalType,
            title,
            message,
        })
        .catch((err) => console.error('[NOTIF_FAIL]', err));
    notifyUser(userId, { movieId, movieVerId, status, title, message });
};

export { notifyJobStatus };
