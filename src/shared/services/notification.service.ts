import { db } from '../configs/db';
import { notifications } from '../schema';
import { io } from '../../server';
import { logger } from '../utils/logger';

const notifyUser = (userId: string, data: unknown) => {
    io.to(`user:${userId}`).emit('notification', data);
};

const notifyJobStatus = async (
    userId: string,
    status: 'started' | 'completed' | 'downloaded' | 'canceled' | 'error',
    title: string,
    message: string,
    movieId?: string,
    movieVerId?: string
) => {
    const typeMap = {
        completed: 'success',
        canceled: 'warning',
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
        .catch((err) => logger.error({ err, userId, movieId, status }, 'Failed to save notification to database'));
    notifyUser(userId, { movieId, movieVerId, status, title, message });
};

export { notifyJobStatus };
