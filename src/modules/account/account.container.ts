import argon2 from 'argon2';
import crypto from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import qrcode from 'qrcode';

import { createAuditLog } from '@shared/services/audit.service';
import { createAccountService } from './account.service';
import { drizzleAccountRepository } from './account.drizzle.repository';
import { createTotpService } from './totp.service';
import type { AccountBackupCodeGenerator, AccountPasswordHasher, AccountQrCodeGenerator, AccountTotpProvider } from './account.ports';

const passwordHasher: AccountPasswordHasher = {
    hash: (value) => argon2.hash(value),
};

const totpProvider: AccountTotpProvider = {
    generateSecret,
    generateURI,
    async verify(data) {
        const result = await verify({ token: data.token, secret: data.secret });
        return result.valid;
    },
};

const qrCodeGenerator: AccountQrCodeGenerator = {
    toDataURL: (value) => qrcode.toDataURL(value),
};

const backupCodeGenerator: AccountBackupCodeGenerator = {
    generate: () => crypto.randomBytes(4).toString('hex').toUpperCase(),
};

export const accountService = createAccountService({
    accountRepository: drizzleAccountRepository,
    passwordHasher,
});

export const accountTotpService = createTotpService({
    accountRepository: drizzleAccountRepository,
    passwordHasher,
    totpProvider,
    qrCodeGenerator,
    backupCodeGenerator,
    auditLogger: { createAuditLog },
});
