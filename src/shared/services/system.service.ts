import { eq } from 'drizzle-orm';
import { db } from '@shared/configs/db';
import { systemSettings as systemSettingsScheme, type SystemSettingsT } from '@schema/system.schema';
import { AppError } from '@shared/errors';
import { env } from '@core/env';
import merge from 'deepmerge';
import EventEmitter from 'node:events';

export const DEFAULT_SETTINGS: SystemSettingsT = {
    features: {
        autoTranscoding: 'compatibility',
        concurrentProcessing: 1,
        registration: {
            enabled: true,
            trustEmails: true,
        },
    },
    preferences: {
        subtitles: [
            { lang: 'en', variants: 1 },
            { lang: 'sr', variants: 2 },
        ],
    },
    external: {
        tmdb: { apiKey: env.TMDB_API_KEY || '' },
        openSubtitles: {
            apiKey: env.OPENSUBS_API_KEY || '',
            username: env.OPENSUBS_USERNAME || '',
            password: env.OPENSUBS_PASSWORD || '',
            useLogin: true,
        },
        email: {
            enabled: env.SMTP_HOST ? true : false,
            smtpSettings: {
                host: env.SMTP_HOST ?? '',
                port: env.SMTP_PORT ?? 0,
                username: env.SMTP_USERNAME ?? '',
                password: env.SMTP_PASSWORD ?? '',
            },
        },
    },
};

const overwriteMerge = (_: unknown[], sourceArray: unknown[]) => sourceArray;

export class SystemSettings extends EventEmitter {
    public async get() {
        const [result] = await db
            .select({ settings: systemSettingsScheme.settings })
            .from(systemSettingsScheme)
            .where(eq(systemSettingsScheme.id, 1));

        if (!result) return this.save(DEFAULT_SETTINGS);

        return merge(DEFAULT_SETTINGS, result.settings, { arrayMerge: overwriteMerge });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async update(settings: any) {
        const current = await this.get();

        const data = await this.save(merge(current, settings, { arrayMerge: overwriteMerge }));

        this.emit('update', data);
        return data;
    }

    private async save(settings: SystemSettingsT): Promise<SystemSettingsT> {
        const [result] = await db
            .insert(systemSettingsScheme)
            .values({
                id: 1,
                settings,
            })
            .onConflictDoUpdate({
                target: systemSettingsScheme.id,
                set: { settings },
            })
            .returning({ settings: systemSettingsScheme.settings });

        if (result) return result.settings;

        throw new AppError('System setting save failed', { statusCode: 500 });
    }
}

export const systemSettings = new SystemSettings();
