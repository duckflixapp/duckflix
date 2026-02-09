import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { db } from '../../shared/db';
import { users, type UserWithoutPassword } from '../../shared/schema';
import { DrizzleQueryError, eq, getTableColumns } from 'drizzle-orm';
import { EmailAlreadyExistsError, InvalidCredentialsError, UserNotCreatedError } from './auth.errors';
import { DatabaseError } from 'pg';

const JWT_SECRET = process.env.JWT_SECRET!;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { password: _pswdClmn, ...columnsWithoutPassword } = getTableColumns(users);

export const register = async (email: string, pass: string): Promise<UserWithoutPassword> => {
    const hashedPassword = await argon2.hash(pass);

    try {
        const [result] = await db
            .insert(users)
            .values({
                email,
                password: hashedPassword,
            })
            .returning(columnsWithoutPassword);

        if (!result) throw new UserNotCreatedError();
        return result;
    } catch (e) {
        if (e instanceof DrizzleQueryError && e.cause instanceof DatabaseError && e.cause.code === '23505')
            throw new EmailAlreadyExistsError();

        throw e;
    }
};

export const login = async (email: string, pass: string): Promise<{ token: string; user: UserWithoutPassword }> => {
    const user = (await db.select().from(users).where(eq(users.email, email)))[0];

    if (!user) throw new InvalidCredentialsError();

    const isPasswordValid = await argon2.verify(user.password, pass);
    if (!isPasswordValid) throw new InvalidCredentialsError();

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    return { token, user };
};
