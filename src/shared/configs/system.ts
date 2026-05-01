import { eq } from 'drizzle-orm';
import { accounts } from '@schema/user.schema';
import { db } from './db';

let systemAccountId: string | null = null;

export const setSystemAccountId = (id: string) => {
    systemAccountId = id;
};
export const getSystemAccountId = () => systemAccountId;

export const fetchSystemAccountId = async () => {
    const [systemUser] = await db.select().from(accounts).where(eq(accounts.system, true)).limit(1);
    if (!systemUser) return systemUser;
    systemAccountId = systemUser.id;
    return systemAccountId;
};
