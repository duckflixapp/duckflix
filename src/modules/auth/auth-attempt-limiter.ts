import { limits } from '@shared/configs/limits.config';
import { AuthTemporarilyLockedError, TooManyAuthAttemptsError } from './auth.errors';

type LimiterState = {
    attempts: number[];
    lockedUntil?: number;
};

type AuthAttemptLimitOptions = {
    maxAttempts: number;
    windowMs: number;
    lockoutMs?: number;
};

type AuthAttemptLimiterOptions = {
    now?: () => number;
    login?: Partial<AuthAttemptLimitOptions>;
    register?: Partial<AuthAttemptLimitOptions>;
};

type Scope = 'login' | 'register';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export class AuthAttemptLimiter {
    private readonly loginAttempts = new Map<string, LimiterState>();
    private readonly registerAttempts = new Map<string, LimiterState>();
    private readonly now: () => number;
    private readonly config: Record<Scope, AuthAttemptLimitOptions>;

    constructor(options: AuthAttemptLimiterOptions = {}) {
        this.now = options.now ?? Date.now;
        this.config = {
            login: {
                maxAttempts: options.login?.maxAttempts ?? limits.authentication.login_max_failed_attempts,
                windowMs: options.login?.windowMs ?? limits.authentication.login_window_ms,
                lockoutMs: options.login?.lockoutMs ?? limits.authentication.login_lockout_ms,
            },
            register: {
                maxAttempts: options.register?.maxAttempts ?? limits.authentication.register_max_attempts,
                windowMs: options.register?.windowMs ?? limits.authentication.register_window_ms,
                lockoutMs: options.register?.lockoutMs ?? limits.authentication.register_lockout_ms,
            },
        };
    }

    public checkLogin(email: string) {
        this.check('login', email);
    }

    public checkRegister(email: string) {
        this.check('register', email);
    }

    public recordFailedLogin(email: string) {
        this.recordFailure('login', email);
    }

    public recordFailedRegister(email: string) {
        this.recordFailure('register', email);
    }

    public resetLogin(email: string) {
        this.reset('login', email);
    }

    public resetRegister(email: string) {
        this.reset('register', email);
    }

    private getStore(scope: Scope) {
        return scope === 'login' ? this.loginAttempts : this.registerAttempts;
    }

    private getState(scope: Scope, email: string) {
        const key = normalizeEmail(email);
        const store = this.getStore(scope);
        const existing = store.get(key);
        const now = this.now();
        const config = this.config[scope];

        const attempts = (existing?.attempts ?? []).filter((timestamp) => now - timestamp < config.windowMs);
        const lockedUntil = existing?.lockedUntil && existing.lockedUntil > now ? existing.lockedUntil : undefined;

        if (attempts.length === 0 && !lockedUntil) {
            store.delete(key);
            return { key, store, state: undefined, now, config };
        }

        const state: LimiterState = { attempts, lockedUntil };
        store.set(key, state);
        return { key, store, state, now, config };
    }

    private check(scope: Scope, email: string) {
        const { state, config, now } = this.getState(scope, email);
        if (!state) return;

        if (state.lockedUntil) throw new AuthTemporarilyLockedError(state.lockedUntil - now);
        if (state.attempts.length >= config.maxAttempts) {
            const oldestAttempt = state.attempts[0];
            const retryAfterMs = oldestAttempt ? config.windowMs - (now - oldestAttempt) : config.windowMs;
            throw new TooManyAuthAttemptsError(retryAfterMs);
        }
    }

    private recordFailure(scope: Scope, email: string) {
        const { key, store, state, now, config } = this.getState(scope, email);
        const attempts = [...(state?.attempts ?? []), now];
        const nextState: LimiterState = { attempts };

        if (config.lockoutMs && attempts.length >= config.maxAttempts) {
            nextState.lockedUntil = now + config.lockoutMs;
        }

        store.set(key, nextState);
    }

    private reset(scope: Scope, email: string) {
        const { key, store } = this.getState(scope, email);
        store.delete(key);
    }
}

export const authAttemptLimiter = new AuthAttemptLimiter();
