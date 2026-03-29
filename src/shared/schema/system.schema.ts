import { type InferSelectModel } from 'drizzle-orm';
import { integer, jsonb, pgTable } from 'drizzle-orm/pg-core';

// ------------------------------------
// Schema
// ------------------------------------
export const systemSettings = pgTable('system_settings', {
    id: integer('id').primaryKey().default(1),
    settings: jsonb('settings')
        .$type<{
            features: {
                autoTranscoding: 'off' | 'compatibility' | 'smart';
                concurrentProcessing: number;
                registration: {
                    enabled: boolean; // is registration allowed
                    trustEmails: boolean; // verify users automatically
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
