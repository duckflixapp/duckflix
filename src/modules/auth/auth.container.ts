import argon2 from 'argon2';
import crypto from 'node:crypto';
import { verify } from 'otplib';

import { logger } from '@shared/configs/logger';
import { createAuditLog } from '@shared/services/audit.service';
import { sendVerificationMail } from '@shared/services/mailer.service';
import { systemSettings } from '@shared/services/system.service';
import { parseDevice } from '@shared/utils/device';
import { signToken, verifyToken } from '@utils/jwt';
import { authAttemptLimiter } from './auth-attempt-limiter';
import { drizzleAuthRepository } from './auth.drizzle.repository';
import { createAuthService } from './auth.service';
import type { AuthDeviceParser, AuthOpaqueTokenService, AuthPasswordHasher, AuthTokenService, AuthTotpVerifier } from './auth.ports';

const passwordHasher: AuthPasswordHasher = {
    hash: (password) => argon2.hash(password),
    verify: (hash, password) => argon2.verify(hash, password),
};

const opaqueTokenService: AuthOpaqueTokenService = {
    generate: () => crypto.randomBytes(32).toString('hex'),
    hash: (token) => crypto.createHash('sha256').update(token).digest('hex'),
};

const tokenService: AuthTokenService = {
    signAccessToken: (payload) => signToken(payload),
    signStepUpToken: (payload, expiresIn) => signToken(payload, expiresIn),
    verifyAccessToken: (token, options) => verifyToken(token, options),
};

const totpVerifier: AuthTotpVerifier = {
    async verify(data) {
        const result = await verify({ token: data.token, secret: data.secret });
        return result.valid;
    },
};

const deviceParser: AuthDeviceParser = {
    parse: (context) => parseDevice(context),
};

export const authService = createAuthService({
    authRepository: drizzleAuthRepository,
    passwordHasher,
    opaqueTokenService,
    tokenService,
    totpVerifier,
    systemSettingsProvider: systemSettings,
    verificationMailer: { sendVerificationMail },
    auditLogger: { createAuditLog },
    logger,
    authAttemptLimiter,
    deviceParser,
});
