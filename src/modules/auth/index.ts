import { Elysia, t } from 'elysia';
import crypto from 'node:crypto';
import * as AuthService from './auth.service';
import { registerSchema, loginSchema, loginChallengeSchema, verifyEmailSchema, stepUpSchema } from './auth.schema';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { UnauthorizedError } from '@shared/middlewares/auth.middleware';
import { env } from '@core/env';
import { limits } from '@shared/configs/limits.config';
import { createRateLimit } from '@shared/configs/ratelimit';

const secure = env.NODE_ENV === 'production';
const accessMaxAge = limits.authentication.access_token_expiry_ms / 1000;
const sessionMaxAge = limits.authentication.session_expiry_ms / 1000;

type CookieSetter = {
    set: (options: {
        value: string;
        httpOnly: boolean;
        secure: boolean;
        maxAge?: number;
        sameSite: 'lax' | 'strict';
        path?: string;
        domain?: string;
    }) => void;
};

const setAuthCookies = (
    cookie: { refresh_token: CookieSetter; auth_token: CookieSetter; csrf_token: CookieSetter },
    session: { token: string; refreshToken: string }
) => {
    const csrfTokenString = crypto.randomBytes(32).toString('hex');

    cookie.refresh_token.set({
        value: session.refreshToken,
        httpOnly: true,
        secure,
        maxAge: sessionMaxAge,
        sameSite: 'lax',
        path: `${env.BASE_URL}/auth/refresh`,
    });
    cookie.auth_token.set({ value: session.token, httpOnly: true, secure, maxAge: accessMaxAge, sameSite: 'lax' });
    cookie.csrf_token.set({
        value: csrfTokenString,
        httpOnly: false,
        secure,
        sameSite: 'lax',
        domain: env.DOMAIN,
        maxAge: sessionMaxAge,
    });
};

const cookieSchema = t.Cookie({
    auth_token: t.Optional(t.String()),
    refresh_token: t.Optional(t.String()),
    csrf_token: t.Optional(t.String()),
});

export const authRouter = new Elysia({ prefix: '/auth' })
    .use(authGuard)
    .guard({ cookie: cookieSchema })
    .use(createRateLimit({ max: 10, duration: 5000 }))
    .post(
        '/register',
        async ({ body, set }) => {
            await AuthService.register(body.name, body.email, body.password);
            set.status = 201;
            return { status: 'success' };
        },
        { body: registerSchema, detail: { tags: ['Auth'], summary: 'Register' } }
    )
    .post(
        '/verify-email',
        async ({ body }) => {
            await AuthService.verifyEmail(body.token);
            return { status: 'success' };
        },
        { body: verifyEmailSchema, detail: { tags: ['Auth'], summary: 'Verify Email' } }
    )
    .post(
        '/login',
        async ({ body, headers, cookie, request, server }) => {
            const ip = server?.requestIP(request)?.address ?? headers['x-forwarded-for'] ?? 'unknown';
            const result = await AuthService.login(body.email, body.password, { ip, userAgent: headers['user-agent'] });

            if (result.requires2fa) {
                return {
                    status: '2fa_required',
                    data: {
                        challengeToken: result.challengeToken,
                        expiresIn: result.expiresIn,
                        methods: result.methods,
                    },
                };
            }

            setAuthCookies(cookie, result);

            return { status: 'success', user: result.user };
        },
        { body: loginSchema, detail: { tags: ['Auth'], summary: 'Login' } }
    )
    .post(
        '/login/verify-2fa',
        async ({ body, headers, cookie, request, server }) => {
            const ip = server?.requestIP(request)?.address ?? headers['x-forwarded-for'] ?? 'unknown';
            const result = await AuthService.verifyLoginChallenge(body.challengeToken, body.method, body.credential, {
                ip,
                userAgent: headers['user-agent'],
            });

            setAuthCookies(cookie, result);

            return { status: 'success', user: result.user };
        },
        { body: loginChallengeSchema, detail: { tags: ['Auth'], summary: 'Verify Login 2FA' } }
    )
    .post(
        '/refresh',
        async ({ cookie }) => {
            const { refresh_token, auth_token, csrf_token } = cookie;
            const oldRefreshToken = refresh_token.value;
            if (!oldRefreshToken) throw new UnauthorizedError('Refresh token missing');

            const result = await AuthService.refresh(oldRefreshToken);
            const csrfTokenString = crypto.randomBytes(32).toString('hex');

            refresh_token.set({
                value: result.refreshToken,
                httpOnly: true,
                secure,
                maxAge: sessionMaxAge,
                sameSite: 'strict',
                path: `${env.BASE_URL}/auth/refresh`,
            });
            auth_token.set({ value: result.token, httpOnly: true, secure, maxAge: accessMaxAge, sameSite: 'lax' });
            csrf_token.set({ value: csrfTokenString, httpOnly: false, secure, sameSite: 'lax', domain: env.DOMAIN, maxAge: sessionMaxAge });

            return { status: 'success' };
        },
        { detail: { tags: ['Auth'], summary: 'Refresh' } }
    )
    .post(
        '/logout',
        async ({ cookie }) => {
            const { refresh_token, auth_token, csrf_token } = cookie;
            const rToken = refresh_token.value;
            if (rToken) await AuthService.logout(rToken);

            auth_token.remove();
            csrf_token.domain = env.DOMAIN;
            csrf_token.remove();
            refresh_token.path = `${env.BASE_URL}/auth/refresh`;
            refresh_token.remove();

            return { status: 'success' };
        },
        { auth: { verified: false }, detail: { tags: ['Auth'], summary: 'Logout' } }
    )
    .group('/step-up', (app) =>
        app
            .guard({ auth: { verified: false } })
            .post(
                '/',
                async ({ body, user }) => {
                    const result = await AuthService.stepUp(user.id, body.scope, body.method, body.credential);
                    return { status: 'success', data: result };
                },
                {
                    body: stepUpSchema,
                    detail: { tags: ['Auth'], summary: 'Step up authentication' },
                }
            )
            .get(
                '/methods',
                async ({ user }) => {
                    const methods = await AuthService.getVerificationMethods(user.id);
                    return { status: 'success', data: { methods } };
                },
                { detail: { tags: ['Auth'], summary: 'Authentication methods to step up' } }
            )
    );
