import nodemailer from 'nodemailer';
import { env } from '../../env';
import { systemSettings } from '../services/system.service';
import type { SystemSettingsT } from '../schema';

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
        console.error('SMTP verify error.\nPlease check your SMTP credentials');
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
    console.log('SMTP configuration updated');
    if (settings.external.email.enabled) verifyTransporter();
});
