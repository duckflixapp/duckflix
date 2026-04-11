import { Elysia } from 'elysia';
import { AppError } from '@shared/errors';

class CSRFError extends AppError {
    constructor(message = 'Invalid CSRF token') {
        super(message, { statusCode: 403 });
    }
}

export const csrfPlugin = new Elysia({ name: 'csrf' }).onBeforeHandle(({ request, cookie }) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;

    const cookieToken = cookie.csrf_token?.value;
    const headerToken = request.headers.get('x-csrf-token');

    if (!cookieToken || !headerToken) throw new CSRFError('Missing CSRF token');
    if (cookieToken !== headerToken) throw new CSRFError();
});
