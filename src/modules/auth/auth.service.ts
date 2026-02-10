import argon2 from 'argon2';
import { db } from '../../shared/db';
import { users } from '../../shared/schema';
import { DrizzleQueryError, eq } from 'drizzle-orm';
import { EmailAlreadyExistsError, InvalidCredentialsError, UserNotCreatedError } from './auth.errors';
import { DatabaseError } from 'pg';
import type { UserDTO } from '@duckflix/shared';
import { toUserDTO } from '../../shared/mappers/user.mapper';
import { signToken } from '../../shared/utils/jwt';

export const register = async (name: string, email: string, pass: string): Promise<UserDTO> => {
    const hashedPassword = await argon2.hash(pass);

    try {
        const [result] = await db
            .insert(users)
            .values({
                name,
                email,
                password: hashedPassword,
            })
            .returning();

        if (!result) throw new UserNotCreatedError();

        return toUserDTO(result);
    } catch (e) {
        if (e instanceof DrizzleQueryError && e.cause instanceof DatabaseError && e.cause.code === '23505')
            throw new EmailAlreadyExistsError();

        throw e;
    }
};

export const login = async (email: string, pass: string): Promise<{ token: string; user: UserDTO }> => {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });

    if (!user) throw new InvalidCredentialsError();

    const isPasswordValid = await argon2.verify(user.password, pass);
    if (!isPasswordValid) throw new InvalidCredentialsError();

    const token = signToken({ userId: user.id });

    return { token, user: toUserDTO(user) };
};
