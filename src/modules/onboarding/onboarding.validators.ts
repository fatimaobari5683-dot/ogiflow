import { z } from 'zod';

export const rejectApplicationSchema = z.object({
  reason: z.string().min(3, 'Le motif de refus doit être explicite (3 caractères minimum).').max(500),
});

export type RejectApplicationInput = z.infer<typeof rejectApplicationSchema>;
