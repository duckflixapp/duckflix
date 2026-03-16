import type { SystemSettingsDTO } from '@duckflix/shared';
import type { SystemSettingsT } from '../schema';

export const maskSecret = (value: string | undefined | null, key: boolean = true): string => {
    if (!value || value.length === 0) return '';
    if (value.length < 12 || !key) return '**********';

    return `${value.slice(0, 4)}**********${value.slice(-4)}`;
};

export const toSystemDTO = (entity: SystemSettingsT): SystemSettingsDTO => {
    return {
        features: {
            autoTranscoding: entity.features?.autoTranscoding ?? 'compatibility',
            concurrentProcessing: Number(entity.features?.concurrentProcessing ?? 1),
            registration: {
                enabled: Boolean(entity.features?.registration.enabled),
                trustEmails: Boolean(entity.features?.registration.trustEmails),
            },
        },
        preferences: {
            subtitles: entity.preferences?.subtitles || [],
        },
        external: {
            tmdb: {
                apiKey: maskSecret(entity.external?.tmdb?.apiKey),
            },
            openSubtitles: {
                apiKey: maskSecret(entity.external?.openSubtitles?.apiKey),
                username: entity.external?.openSubtitles?.username ?? '',
                password: maskSecret(entity.external?.openSubtitles?.password, false),
                useLogin: Boolean(entity.external?.openSubtitles?.useLogin),
            },
            email: {
                enabled: Boolean(entity.external?.email?.enabled),
                smtpSettings: {
                    host: entity.external?.email?.smtpSettings?.host ?? '',
                    port: Number(entity.external?.email?.smtpSettings?.port ?? 0),
                    username: entity.external?.email?.smtpSettings?.username ?? '',
                    password: maskSecret(entity.external?.email?.smtpSettings?.password, false),
                },
            },
        },
    };
};

export const getValueOrSkip = (newValue: string): string | undefined => {
    if (!newValue) return '';

    if (newValue.includes('**********')) {
        return undefined;
    }

    return newValue;
};
