export interface SessionData {
    accountId: string;
    videoId: string;
    original: {
        storageKey: string;
        height: number;
        duration: number;
    };
    expiresAt: number;
}

export interface SessionRepository {
    get(id: string): Promise<SessionData | null>;
    set(id: string, data: SessionData): Promise<void>;
    delete(id: string): Promise<void>;
    has(id: string): Promise<boolean>;
}
