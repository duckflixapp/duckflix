import { AppError } from '@shared/errors';
import { InMemorySessionRepository } from './session.memory.repository';
import type { SessionData, SessionRepository } from './session.repository';

const SESSION_TTL_MS = 60 * 60 * 16 * 1000; // 16h

class UnauthorizedSession extends AppError {
    constructor() {
        super('Unauthorized session', { statusCode: 401 });
    }
}

export class SessionClient {
    constructor(private readonly repository: SessionRepository) {}

    async create(data: Omit<SessionData, 'expiresAt'>): Promise<string> {
        const id = crypto.randomUUID();

        const expiry = Date.now() + SESSION_TTL_MS;
        await this.repository.set(id, {
            ...data,
            expiresAt: expiry,
        });

        return id;
    }

    async validate(id: string, videoId: string): Promise<{ id: string; data: SessionData }> {
        const session = await this.repository.get(id);

        if (!session) throw new UnauthorizedSession();

        if (session.expiresAt <= Date.now()) {
            await this.repository.delete(id);
            throw new UnauthorizedSession();
        }

        if (session.videoId !== videoId) throw new UnauthorizedSession();

        return {
            id: id,
            data: session,
        };
    }
}

export const sessionClient = new SessionClient(new InMemorySessionRepository());
