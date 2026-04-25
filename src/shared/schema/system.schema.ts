import { type InferSelectModel } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ------------------------------------
// Schema
// ------------------------------------
export const systemSettings = sqliteTable('system_settings', {
    id: integer('id').primaryKey().default(1),
    settings: text('settings', { mode: 'json' })
        .$type<{
            features: {
                autoTranscoding: 'off' | 'compatibility' | 'smart';
                concurrentProcessing: number;
                registration: {
                    enabled: boolean;
                    trustEmails: boolean;
                };
            };
            preferences: {
                subtitles: { lang: string; variants: number }[];
            };
            external: {
                tmdb: {
                    apiKey: string;
                };
                openSubtitles: {
                    apiKey: string;
                    username: string;
                    password: string;
                    useLogin: boolean;
                };
                email: {
                    enabled: boolean;
                    smtpSettings?: {
                        host: string;
                        port: number;
                        username: string;
                        password: string;
                    };
                };
            };
        }>()
        .notNull(),
});
// ------------------------------------
// Types
// ------------------------------------
export type SystemSettingsRow = InferSelectModel<typeof systemSettings>;
export type SystemSettingsT = SystemSettingsRow['settings'];
