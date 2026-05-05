import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import path from 'node:path';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { afterAll, beforeAll } from 'bun:test';
import { env } from 'bun';

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
const certsDir = path.resolve(process.cwd(), 'certs');
const privateKeyPath = path.join(certsDir, 'private.pem');
const publicKeyPath = path.join(certsDir, 'public.pem');
const shouldGenerateJwtCerts = !existsSync(privateKeyPath) && !existsSync(publicKeyPath);

if (shouldGenerateJwtCerts) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });

    await mkdir(certsDir, { recursive: true });
    await writeFile(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    await writeFile(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
} else if (!existsSync(privateKeyPath) || !existsSync(publicKeyPath)) {
    throw new Error('JWT test certs are incomplete. Provide both certs/private.pem and certs/public.pem, or neither.');
}

if (!resolvedDatabasePath.includes(`${path.sep}test${path.sep}`) && !path.basename(resolvedDatabasePath).includes('test')) {
    throw new Error(`Refusing to remove a database path that does not look test-only: ${resolvedDatabasePath}`);
}

await mkdir(path.dirname(resolvedDatabasePath), { recursive: true });
await rm(resolvedDatabasePath, { force: true });
await rm(`${resolvedDatabasePath}-shm`, { force: true });
await rm(`${resolvedDatabasePath}-wal`, { force: true });

const { db } = await import('@shared/configs/db');

migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });

afterAll(async () => {
    const testFolder = env.TEST_FOLDER_PATH ?? null;
    if (!testFolder) return;

    await rm(path.resolve(testFolder), { force: true, recursive: true });
    if (shouldGenerateJwtCerts) await rm(certsDir, { force: true, recursive: true });

    console.log('- Test cleanup finished');
});

beforeAll(() => {
    console.log('- Test environment is set up.');
});
