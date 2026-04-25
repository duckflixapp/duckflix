import { DrizzleQueryError } from 'drizzle-orm';

export const isDuplicateKey = (e: unknown) => {
    return e instanceof DrizzleQueryError && e.message.includes('UNIQUE constraint failed');
};
