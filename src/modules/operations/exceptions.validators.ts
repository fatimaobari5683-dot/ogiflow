import { z } from 'zod';

export const listExceptionsQuerySchema = z.object({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
});

export const resolveExceptionSchema = z.object({
  resolution: z.string().min(3, 'La résolution doit être décrite (3 caractères minimum).'),
});
