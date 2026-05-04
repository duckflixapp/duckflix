import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const databasePath = process.env.DATABASE_PATH;

if (process.env.NODE_ENV !== 'test') {
    throw new Error('Refusing to initialize the test database outside NODE_ENV=test.');
}

if (!databasePath) {
    throw new Error('DATABASE_PATH is required for tests.');
}

if (databasePath === ':memory:') {
    throw new Error('Use a file-backed SQLite database for integration tests, not :memory:.');
}

const resolvedDatabasePath = path.resolve(process.cwd(), databasePath);

if (!resolvedDatabasePath.includes(`${path.sep}test${path.sep}`) && !path.basename(resolvedDatabasePath).includes('test')) {
    throw new Error(`Refusing to remove a database path that does not look test-only: ${resolvedDatabasePath}`);
}

await mkdir(path.dirname(resolvedDatabasePath), { recursive: true });
await rm(resolvedDatabasePath, { force: true });
await rm(`${resolvedDatabasePath}-shm`, { force: true });
await rm(`${resolvedDatabasePath}-wal`, { force: true });

const { db } = await import('@shared/configs/db');

migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });

console.log('Test environment is set up.');
