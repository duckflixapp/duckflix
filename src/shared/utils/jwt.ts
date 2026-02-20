import jwt from 'jsonwebtoken';
import { env } from '../../env';
import type { UserRole } from '@duckflix/shared';
import { limits } from '../configs/limits.config';
import path from 'node:path';
import fs from 'node:fs';

const CERTS_DIR = path.resolve('../../certs');
const PRIVATE_KEY_PATH = path.join(CERTS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(CERTS_DIR, 'public.pem');

if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(PUBLIC_KEY_PATH)) {
    console.error(`JWT Keys missing!\nExpected at: ${CERTS_DIR}\n` + `Please run key generation script or check Docker volumes.`);
    process.exit(1);
}

const privateKey = fs.readFileSync(path.join(CERTS_DIR, 'private.pem'), 'utf8');
const publicKey = fs.readFileSync(path.join(CERTS_DIR, 'public.pem'), 'utf8');

export interface TokenPayload {
    sub: string;
    role: UserRole;
    isVerified: boolean;
}

export const signToken = (payload: TokenPayload): string => {
    return jwt.sign(payload, privateKey, {
        expiresIn: limits.authentication.access_token_expiry_ms / 1000,
        algorithm: 'ES384',
        issuer: 'duckflix-api',
        audience: env.ORIGIN,
    });
};

export const verifyToken = (token: string): TokenPayload => {
    return jwt.verify(token, publicKey, {
        algorithms: ['ES384'],
        issuer: 'duckflix-api',
        audience: env.ORIGIN,
    }) as TokenPayload;
};
