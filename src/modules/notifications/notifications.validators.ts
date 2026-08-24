import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  userId: z.string().optional(),
  status: z.enum(['QUEUED', 'SENT', 'FAILED']).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
