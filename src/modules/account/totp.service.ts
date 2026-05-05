import { AppError } from '@shared/errors';
import type {
    AccountAuditLogger,
    AccountBackupCodeGenerator,
    AccountPasswordHasher,
    AccountQrCodeGenerator,
    AccountRepository,
    AccountTotpProvider,
} from './account.ports';

type TotpServiceDependencies = {
    accountRepository: AccountRepository;
    passwordHasher: AccountPasswordHasher;
    totpProvider: AccountTotpProvider;
    qrCodeGenerator: AccountQrCodeGenerator;
    backupCodeGenerator: AccountBackupCodeGenerator;
    auditLogger: AccountAuditLogger;
};

export const createTotpService = ({
    accountRepository,
    passwordHasher,
    totpProvider,
    qrCodeGenerator,
    backupCodeGenerator,
    auditLogger,
}: TotpServiceDependencies) => {
    const getTotpSetup = async (accountId: string) => {
        const account = await accountRepository.findUserEmail(accountId);
        if (!account) throw new AppError('User not found', { statusCode: 404 });

        const totp = await accountRepository.getTotp(accountId);
        const secret = totp?.pendingSecret ?? totpProvider.generateSecret();

        if (!totp?.pendingSecret) {
            await accountRepository.savePendingTotp({
                accountId,
                pendingSecret: secret,
                updatedAt: new Date().toISOString(),
            });
        }

        const otpauth = totpProvider.generateURI({ issuer: 'DuckFlix', label: account.email, secret });
        const qrCodeUrl = await qrCodeGenerator.toDataURL(otpauth);

        const manualKey = secret.match(/.{1,4}/g)?.join(' ') ?? secret;

        return { qrCodeUrl, manualKey };
    };

    const cancelTotpSetup = async (accountId: string) => {
        await accountRepository.cancelPendingTotp({ accountId, updatedAt: new Date().toISOString() });
    };

    const activateTotp = async (accountId: string, code: string) => {
        const totp = await accountRepository.getTotp(accountId);

        if (!totp?.pendingSecret) {
            throw new AppError('No pending TOTP setup found', { statusCode: 400 });
        }

        const isValid = await totpProvider.verify({ token: code, secret: totp.pendingSecret });
        if (!isValid) throw new AppError('Invalid code', { statusCode: 400 });

        const backupCodes = Array.from({ length: 8 }, () => backupCodeGenerator.generate());
        const hashedBackupCodes = await Promise.all(backupCodes.map((code) => passwordHasher.hash(code)));

        await accountRepository.activateTotp({
            accountId,
            secret: totp.pendingSecret,
            backupCodeHashes: hashedBackupCodes,
            updatedAt: new Date().toISOString(),
        });

        await auditLogger.createAuditLog({
            actorAccountId: accountId,
            action: 'account.totp.activated',
            targetType: 'user',
            targetId: accountId,
        });

        return { backupCodes };
    };

    const deactivateTotp = async (accountId: string) => {
        const exists = await accountRepository.userExists(accountId);
        if (!exists) throw new AppError('User not found', { statusCode: 404 });

        await accountRepository.deactivateTotp({ accountId, updatedAt: new Date().toISOString() });

        await auditLogger.createAuditLog({
            actorAccountId: accountId,
            action: 'account.totp.deactivated',
            targetType: 'user',
            targetId: accountId,
        });
    };

    return {
        activateTotp,
        cancelTotpSetup,
        deactivateTotp,
        getTotpSetup,
    };
};

export type TotpService = ReturnType<typeof createTotpService>;
