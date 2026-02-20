declare namespace Express {
    export interface Request {
        user?: {
            id: string;
            role: 'watcher' | 'contributor' | 'admin';
            isVerified: boolean;
        };
    }
}
