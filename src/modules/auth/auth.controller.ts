import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import * as AuthService from './auth.service';
import { registerSchema, loginSchema } from './auth.schema';
import { catchAsync } from '../../shared/utils/catchAsync';
import { env } from '../../env';
import { UnauthorizedError } from '../../shared/middlewares/auth.middleware';
import { limits } from '../../shared/configs/limits.config';
import { AppError } from '../../shared/errors';

export const register = catchAsync(async (req: Request, res: Response) => {
    const data = registerSchema.parse(req.body); // validate data

    await AuthService.register(data.name, data.email, data.password);

    return res.status(201).json({ status: 'success' });
});

export const verifyEmail = catchAsync(async (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token || typeof token !== 'string') throw new AppError('Token missing', { statusCode: 400 });

    await AuthService.verifyEmail(token);

    return res.status(200).json({ status: 'success' });
});

export const login = catchAsync(async (req: Request, res: Response) => {
    const data = loginSchema.parse(req.body); // validate data

    const result = await AuthService.login(data.email, data.password, { ip: req.ip, userAgent: req.headers['user-agent'] });

    const csrfToken = crypto.randomBytes(32).toString('hex');

    res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        maxAge: limits.authentication.session_expiry_ms,
        sameSite: 'lax',
        path: `${env.BASE_URL}/auth/refresh`,
    });
    res.cookie('auth_token', result.token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        maxAge: limits.authentication.access_token_expiry_ms,
        sameSite: 'lax',
    });
    res.cookie('csrf_token', csrfToken, {
        httpOnly: false,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        domain: env.DOMAIN,
        maxAge: limits.authentication.session_expiry_ms,
    });

    return res.json({ status: 'success', user: result.user });
});

export const logout = catchAsync(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refresh_token;

    if (refreshToken) await AuthService.logout(refreshToken);

    res.clearCookie('auth_token');
    res.clearCookie('csrf_token', { domain: env.DOMAIN });
    res.clearCookie('refresh_token', { path: `${env.BASE_URL}/auth/refresh` });
    return res.status(200).json({ status: 'success' });
});

export const refresh = catchAsync(async (req: Request, res: Response) => {
    const oldRefreshToken = req.cookies.refresh_token;
    if (!oldRefreshToken) throw new UnauthorizedError('Refresh token missing');

    const result = await AuthService.refresh(oldRefreshToken);

    const csrfToken = crypto.randomBytes(32).toString('hex');

    res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        maxAge: limits.authentication.session_expiry_ms,
        sameSite: 'strict',
        path: `${env.BASE_URL}/auth/refresh`,
    });
    res.cookie('auth_token', result.token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        maxAge: limits.authentication.access_token_expiry_ms,
        sameSite: 'lax',
    });
    res.cookie('csrf_token', csrfToken, {
        httpOnly: false,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        domain: env.DOMAIN,
        maxAge: limits.authentication.session_expiry_ms,
    });
    return res.status(200).json({ status: 'success' });
});
