import { eq, not } from 'drizzle-orm';
import { db } from '../../shared/configs/db';
import { users } from '../../shared/schema';
import { toUserDTO } from '../../shared/mappers/user.mapper';
import type { UserDTO, UserRole } from '@duckflix/shared';
import { AppError } from '../../shared/errors';

export const getUsersWithRoles = async (): Promise<UserDTO[]> => {
    const results = await db
        .select()
        .from(users)
        .where(not(eq(users.role, 'watcher')));

    return results.map(toUserDTO);
};

export const changeUserRole = async (email: string, role: UserRole, context: { user: string }): Promise<void> => {
    return await db.transaction(async (tx) => {
        const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
        if (!user) throw new AppError('User not found, no changes were made', { statusCode: 404 });
        if (user.id == context.user) throw new AppError('You are not allowed to change your own role', { statusCode: 403 });

        await tx.update(users).set({ role }).where(eq(users.id, user.id));
    });
};
