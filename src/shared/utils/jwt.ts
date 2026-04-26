import jwt from 'jsonwebtoken';
import { env } from '@core/env';
import type { UserRole } from '@duckflixapp/shared';
import { limits } from '@shared/configs/limits.config';
import path from 'node:path';
import fs from 'node:fs';
import { logger } from '@shared/configs/logger';

const CERTS_DIR = path.resolve('./certs');
const PRIVATE_KEY_PATH = path.join(CERTS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(CERTS_DIR, 'public.pem');

if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(PUBLIC_KEY_PATH)) {
    logger.fatal(
        {
            certsDir: CERTS_DIR,
            privateKeyExists: fs.existsSync(PRIVATE_KEY_PATH),
            publicKeyExists: fs.existsSync(PUBLIC_KEY_PATH),
        },
        'JWT_KEYS_MISSING'
    );

    process.exit(1);
}

const privateKey = fs.readFileSync(path.join(CERTS_DIR, 'private.pem'), 'utf8');
const publicKey = fs.readFileSync(path.join(CERTS_DIR, 'public.pem'), 'utf8');

export interface TokenPayload {
    sub: string;
    role: UserRole;
    isVerified: boolean;
}

export interface StepUpTokenPayload {
    scope?: string;
    stepUp?: boolean;
}

export const signToken = (payload: TokenPayload | StepUpTokenPayload, expiryMs = limits.authentication.access_token_expiry_ms): string => {
    return jwt.sign(payload, privateKey, {
        expiresIn: expiryMs / 1000,
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

export const verifyStepUpToken = (token: string): StepUpTokenPayload => {
    return jwt.verify(token, publicKey, {
        algorithms: ['ES384'],
        issuer: 'duckflix-api',
        audience: env.ORIGIN,
    }) as StepUpTokenPayload;
};
