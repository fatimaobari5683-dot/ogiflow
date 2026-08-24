import { z } from 'zod';

export const assignDriverSchema = z.object({
  driverId: z.string().min(1),
});

export type AssignDriverInput = z.infer<typeof assignDriverSchema>;
