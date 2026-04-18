import { describe, expect, test } from 'bun:test';
import { AuthTemporarilyLockedError, TooManyAuthAttemptsError } from './auth.errors';
import { AuthAttemptLimiter } from './auth-attempt-limiter';

describe('AuthAttemptLimiter', () => {
    test('allows login attempts before the failure threshold', () => {
        const limiter = new AuthAttemptLimiter({
            login: { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 },
        });

        limiter.recordFailedLogin('user@example.com');
        limiter.recordFailedLogin('user@example.com');
        limiter.recordFailedLogin('user@example.com');
        limiter.recordFailedLogin('user@example.com');

        expect(() => limiter.checkLogin('user@example.com')).not.toThrow();
    });

    test('blocks login after the fifth failed attempt', () => {
        let now = 0;
        const limiter = new AuthAttemptLimiter({
            now: () => now,
            login: { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 },
        });

        for (let i = 0; i < 5; i++) limiter.recordFailedLogin('user@example.com');

        expect(() => limiter.checkLogin('user@example.com')).toThrow(AuthTemporarilyLockedError);

        now = 15 * 60 * 1000 - 1;
        expect(() => limiter.checkLogin('user@example.com')).toThrow(AuthTemporarilyLockedError);

        now = 15 * 60 * 1000;
        expect(() => limiter.checkLogin('user@example.com')).not.toThrow();
    });

    test('login lock does not extend on repeated blocked checks', () => {
        let now = 0;
        const limiter = new AuthAttemptLimiter({
            now: () => now,
            login: { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 },
        });

        for (let i = 0; i < 5; i++) limiter.recordFailedLogin('user@example.com');

        now = 5 * 60 * 1000;
        expect(() => limiter.checkLogin('user@example.com')).toThrow(AuthTemporarilyLockedError);

        now = 15 * 60 * 1000;
        expect(() => limiter.checkLogin('user@example.com')).not.toThrow();
    });

    test('successful login resets the failure counter', () => {
        const limiter = new AuthAttemptLimiter({
            login: { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 },
        });

        for (let i = 0; i < 4; i++) limiter.recordFailedLogin('user@example.com');

        limiter.resetLogin('user@example.com');

        expect(() => limiter.checkLogin('user@example.com')).not.toThrow();
    });

    test('blocks register after the third failed attempt with a fixed lock', () => {
        let now = 0;
        const limiter = new AuthAttemptLimiter({
            now: () => now,
            register: { maxAttempts: 3, windowMs: 30 * 60 * 1000, lockoutMs: 30 * 60 * 1000 },
        });

        limiter.recordFailedRegister('user@example.com');
        limiter.recordFailedRegister('user@example.com');
        limiter.recordFailedRegister('user@example.com');

        expect(() => limiter.checkRegister('user@example.com')).toThrow(AuthTemporarilyLockedError);

        now = 30 * 60 * 1000 - 1;
        expect(() => limiter.checkRegister('user@example.com')).toThrow(AuthTemporarilyLockedError);

        now = 30 * 60 * 1000;
        expect(() => limiter.checkRegister('user@example.com')).not.toThrow();
    });

    test('tracks different emails independently', () => {
        const limiter = new AuthAttemptLimiter({
            register: { maxAttempts: 3, windowMs: 30 * 60 * 1000, lockoutMs: 30 * 60 * 1000 },
        });

        limiter.recordFailedRegister('first@example.com');
        limiter.recordFailedRegister('first@example.com');
        limiter.recordFailedRegister('first@example.com');

        expect(() => limiter.checkRegister('first@example.com')).toThrow(AuthTemporarilyLockedError);
        expect(() => limiter.checkRegister('second@example.com')).not.toThrow();
    });
});
