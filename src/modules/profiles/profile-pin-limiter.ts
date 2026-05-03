import { limits } from '@shared/configs/limits.config';
import { AppError } from '@shared/errors';

type LimiterState = {
    attempts: number[];
    lockedUntil?: number;
};

export class ProfilePinLimiter {
    private readonly attempts = new Map<string, LimiterState>();

    public check(key: string) {
        const { state, now } = this.getState(key);
        if (!state?.lockedUntil) return;

        throw this.createLockedError(state.lockedUntil - now);
    }

    public recordFailure(key: string) {
        const { state, now } = this.getState(key);
        const attempts = [...(state?.attempts ?? []), now];
        const nextState: LimiterState = { attempts };

        if (attempts.length >= limits.profile.pin_max_failed_attempts) {
            nextState.lockedUntil = now + limits.profile.pin_lockout_ms;
        }

        this.attempts.set(key, nextState);
    }

    public reset(key: string) {
        this.attempts.delete(key);
    }

    private getState(key: string) {
        const now = Date.now();
        const existing = this.attempts.get(key);
        const attempts = (existing?.attempts ?? []).filter((timestamp) => now - timestamp < limits.profile.pin_window_ms);
        const lockedUntil = existing?.lockedUntil && existing.lockedUntil > now ? existing.lockedUntil : undefined;

        if (attempts.length === 0 && !lockedUntil) {
            this.attempts.delete(key);
            return { state: undefined, now };
        }

        const state: LimiterState = { attempts, lockedUntil };
        this.attempts.set(key, state);
        return { state, now };
    }

    private createLockedError(retryAfterMs: number) {
        const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
        return new AppError('Too many profile PIN attempts. Try again later.', {
            statusCode: 429,
            headers: { 'Retry-After': String(retryAfterSeconds) },
            details: { retryAfterSeconds },
        });
    }
}

export const profilePinLimiter = new ProfilePinLimiter();
