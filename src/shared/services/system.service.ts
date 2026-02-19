import { eq } from 'drizzle-orm';
import { db } from '../db';
import { systemSettings, type SystemSettings } from '../schema';
import { AppError } from '../errors';
import { env } from '../../env';

export const DEFAULT_SETTINGS: SystemSettings = {
    features: {
        autoTranscoding: 'compatibility',
        concurrentProcessing: 1,
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
            useLogin: false,
        },
    },
};

export const getSystemSettings = async (): Promise<SystemSettings> => {
    const [result] = await db.select({ settings: systemSettings.settings }).from(systemSettings).where(eq(systemSettings.id, 1));

    if (!result) return saveSystemSettings(DEFAULT_SETTINGS);

    return {
        ...DEFAULT_SETTINGS,
        ...result.settings,
        features: { ...DEFAULT_SETTINGS.features, ...result.settings.features },
        external: { ...DEFAULT_SETTINGS.external, ...result.settings.external },
    };
};

export const saveSystemSettings = async (settings: SystemSettings): Promise<SystemSettings> => {
    const [result] = await db
        .insert(systemSettings)
        .values({
            id: 1,
            settings,
        })
        .onConflictDoUpdate({
            target: systemSettings.id,
            set: { settings },
        })
        .returning({ settings: systemSettings.settings });

    if (result) return result.settings;

    throw new AppError('System setting save failed', { statusCode: 500 });
};
