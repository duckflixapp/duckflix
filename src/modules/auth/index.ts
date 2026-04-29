import { Elysia, t } from 'elysia';
import crypto from 'node:crypto';
import * as AuthService from './auth.service';
import { registerSchema, loginSchema, loginChallengeSchema, verifyEmailSchema, stepUpSchema } from './auth.schema';
import { authGuard } from '@shared/middlewares/auth.middleware';
import { UnauthorizedError } from '@shared/middlewares/auth.middleware';
import { env } from '@core/env';
import { limits } from '@shared/configs/limits.config';
import { createRateLimit } from '@shared/configs/ratelimit';
import { trustProxy } from '@shared/plugins/trust-proxy';

const secure = env.NODE_ENV === 'production';
const accessMaxAge = limits.authentication.access_token_expiry_ms / 1000;
const sessionMaxAge = limits.authentication.session_expiry_ms / 1000;
const apiBasePath = new URL(env.BASE_URL).pathname.replace(/\/$/, '');
const authCookiePath = `${apiBasePath}/auth`;

const getAuthContext = (headers: Record<string, string | undefined>, clientIp?: string | null) => ({
    ip: clientIp ?? undefined,
    userAgent: headers['user-agent'],
    clientHints: {
        brands: headers['sec-ch-ua'],
        mobile: headers['sec-ch-ua-mobile'],
        platform: headers['sec-ch-ua-platform'],
    },
});

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
        path: authCookiePath,
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
    .use(trustProxy())
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
        async ({ body, headers, cookie, clientIp }) => {
            const result = await AuthService.login(body.email, body.password, getAuthContext(headers, clientIp));

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
        async ({ body, headers, cookie, clientIp }) => {
            const result = await AuthService.verifyLoginChallenge(
                body.challengeToken,
                body.method,
                body.credential,
                getAuthContext(headers, clientIp)
            );

            setAuthCookies(cookie, result);

            return { status: 'success', user: result.user };
        },
        { body: loginChallengeSchema, detail: { tags: ['Auth'], summary: 'Verify Login 2FA' } }
    )
    .post(
        '/refresh',
        async ({ headers, cookie, clientIp }) => {
            const { refresh_token, auth_token, csrf_token } = cookie;
            const oldRefreshToken = refresh_token.value;
            if (!oldRefreshToken) throw new UnauthorizedError('Refresh token missing');

            const result = await AuthService.refresh(oldRefreshToken, getAuthContext(headers, clientIp));
            const csrfTokenString = crypto.randomBytes(32).toString('hex');

            refresh_token.set({
                value: result.refreshToken,
                httpOnly: true,
                secure,
                maxAge: sessionMaxAge,
                sameSite: 'strict',
                path: authCookiePath,
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
            await AuthService.logout({
                refreshToken: refresh_token.value,
                accessToken: auth_token.value,
            });

            auth_token.remove();
            csrf_token.domain = env.DOMAIN;
            csrf_token.remove();
            refresh_token.path = authCookiePath;
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
