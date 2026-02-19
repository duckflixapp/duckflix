import jwt from 'jsonwebtoken';
import { env } from '../../env';

const JWT_SECRET = env.JWT_SECRET;

export interface TokenPayload {
    userId: string;
    role: 'contributor' | 'admin' | 'watcher';
}

export const signToken = (payload: TokenPayload): string => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

export const verifyToken = (token: string): TokenPayload => {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
};
