import { z } from 'zod';

export const streamParamsSchema = z.object({
    versionId: z.uuid('Invalid video version ID format'),
});
