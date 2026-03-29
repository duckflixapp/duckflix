import nodemailer from 'nodemailer';
import { env } from '@core/env';
import { systemSettings } from '@shared/services/system.service';
import type { SystemSettingsT } from '@schema/system.schema';
import { logger } from './logger';

const sysSettings = await systemSettings.get();
let emailSettings = sysSettings.external.email;

function createTransporter(settings: SystemSettingsT) {
    const smtp = settings.external.email.smtpSettings;

    return nodemailer.createTransport({
        host: smtp?.host,
        port: Number(smtp?.port),
        secure: false,
        auth: {
            user: smtp?.username,
            pass: smtp?.password,
        },
        tls: {
            rejectUnauthorized: env.NODE_ENV === 'production',
        },
    });
}

export let transporter = createTransporter(sysSettings);

const verifyTransporter = () =>
    transporter.verify().catch(() => {
        logger.error({ context: 'external_api', service: 'email' }, 'Failed verifying SMTP Credentials');
    });

if (emailSettings.enabled) verifyTransporter();

systemSettings.addListener('update', (settings: SystemSettingsT) => {
    const smtpSettings = settings.external.email.smtpSettings;
    if (
        settings.external.email.enabled === emailSettings.enabled &&
        smtpSettings?.host === emailSettings.smtpSettings?.host &&
        smtpSettings?.port === emailSettings.smtpSettings?.port &&
        smtpSettings?.username === emailSettings.smtpSettings?.username &&
        smtpSettings?.password === emailSettings.smtpSettings?.password
    )
        return;

    emailSettings = { ...settings.external.email };
    transporter = createTransporter(settings);
    logger.info({ context: 'external_api', service: 'email' }, 'SMTP Configuration updated');
    if (settings.external.email.enabled) verifyTransporter();
});
