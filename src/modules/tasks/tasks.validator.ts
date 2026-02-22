import { z } from 'zod';

export const killTaskSchema = z.object({
    id: z.uuid(),
});
