import { eq } from 'drizzle-orm';
import { users } from '@schema/user.schema';
import { db } from './db';

let systemUserId: string | null = null;

export const setSystemUserId = (id: string) => {
    systemUserId = id;
};
export const getSystemUserId = () => systemUserId;

export const fetchSystemUserId = async () => {
    const [systemUser] = await db.select().from(users).where(eq(users.system, true)).limit(1);
    if (!systemUser) return systemUser;
    systemUserId = systemUser.id;
    return systemUserId;
};
