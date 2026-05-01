import { env } from '@core/env';
import { limits } from '@shared/configs/limits.config';
import type { Cookie, CookieOptions } from 'elysia';
import crypto from 'node:crypto';

type AuthCookieJar = {
    auth_token?: Cookie<unknown>;
    refresh_token?: Cookie<unknown>;
    csrf_token?: Cookie<unknown>;
};

type AuthSession = {
    token: string;
    refreshToken: string;
};

const secure = env.NODE_ENV === 'production';
const accessMaxAge = limits.authentication.access_token_expiry_ms / 1000;
const sessionMaxAge = limits.authentication.session_expiry_ms / 1000;
const apiBasePath = new URL(env.BASE_URL).pathname.replace(/\/$/, '');

export const authCookiePath = `${apiBasePath}/auth`;

const accessCookieOptions: CookieOptions = {
    httpOnly: true,
    secure,
    maxAge: accessMaxAge,
    sameSite: 'lax',
};

const refreshCookieOptions = (sameSite: 'lax' | 'strict' = 'lax'): CookieOptions => ({
    httpOnly: true,
    secure,
    maxAge: sessionMaxAge,
    sameSite,
    path: authCookiePath,
});

const csrfCookieOptions: CookieOptions = {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    domain: env.DOMAIN,
    maxAge: sessionMaxAge,
};

export const createCsrfToken = () => crypto.randomBytes(32).toString('hex');

export const setAuthCookies = (cookie: Required<AuthCookieJar>, session: AuthSession) => {
    cookie.refresh_token.set({
        value: session.refreshToken,
        ...refreshCookieOptions(),
    });
    cookie.auth_token.set({
        value: session.token,
        ...accessCookieOptions,
    });
    cookie.csrf_token.set({
        value: createCsrfToken(),
        ...csrfCookieOptions,
    });
};

export const refreshAuthCookies = (cookie: Required<AuthCookieJar>, session: AuthSession) => {
    cookie.refresh_token.set({
        value: session.refreshToken,
        ...refreshCookieOptions('strict'),
    });
    cookie.auth_token.set({
        value: session.token,
        ...accessCookieOptions,
    });
    cookie.csrf_token.set({
        value: createCsrfToken(),
        ...csrfCookieOptions,
    });
};

export const setAuthTokenCookie = (cookie: Pick<Required<AuthCookieJar>, 'auth_token'>, token: string) => {
    cookie.auth_token.set({
        value: token,
        ...accessCookieOptions,
    });
};

export const clearAuthCookies = (cookie: AuthCookieJar) => {
    cookie.auth_token?.remove();

    if (cookie.csrf_token) {
        cookie.csrf_token.domain = env.DOMAIN;
        cookie.csrf_token.remove();
    }

    if (cookie.refresh_token) {
        cookie.refresh_token.path = authCookiePath;
        cookie.refresh_token.remove();
    }
};
