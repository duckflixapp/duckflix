import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const databasePath = process.env.DATABASE_PATH;

if (!databasePath) {
    console.error('DATABASE_PATH is required to run database migrations.');
    process.exit(1);
}

if (databasePath !== ':memory:') {
    await mkdir(path.dirname(path.resolve(process.cwd(), databasePath)), { recursive: true });
}

const sqlite = new Database(databasePath);

sqlite.run('PRAGMA journal_mode=WAL');
sqlite.run('PRAGMA synchronous=NORMAL');
sqlite.run('PRAGMA foreign_keys=ON');

const db = drizzle(sqlite);

migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });

sqlite.close();

console.log('Database migrations applied successfully.');
