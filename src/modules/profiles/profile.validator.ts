import { z } from 'zod';

export const profileParamsSchema = z.object({
    id: z.uuid(),
});
