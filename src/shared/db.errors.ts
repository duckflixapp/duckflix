import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';

export const isDuplicateKey = (e: unknown) => {
    return e instanceof DrizzleQueryError && e.cause instanceof DatabaseError && e.cause.code === '23505';
};
