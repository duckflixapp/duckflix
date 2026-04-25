import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from '@shared/schema';
import { env } from '@core/env';

const sqlite = new Database(env.DATABASE_PATH);

sqlite.run('PRAGMA journal_mode=WAL');
sqlite.run('PRAGMA synchronous=NORMAL');
sqlite.run('PRAGMA foreign_keys=ON');

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const db = drizzle(sqlite, { schema });
