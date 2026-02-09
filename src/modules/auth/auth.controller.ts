import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import * as AuthService from './auth.service';
import { registerSchema, loginSchema } from './auth.schema';
import { catchAsync } from '../../shared/utils/catchAsync';

export const register = catchAsync(async (req: Request, res: Response) => {
    const data = registerSchema.parse(req.body); // validate data

    const user = await AuthService.register(data.email, data.password);
    return res.status(201).json({ message: 'User created', id: user.id });
});

export const login = catchAsync(async (req: Request, res: Response) => {
    const data = loginSchema.parse(req.body); // validate data

    const result = await AuthService.login(data.email, data.password);

    const csrfToken = crypto.randomBytes(32).toString('hex');

    res.cookie('auth_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
        sameSite: 'lax',
    });
    res.cookie('csrf_token', csrfToken, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
    });

    return res.json({ message: 'Login successfull' });
});
