import { z } from 'zod';

export const sendMessageSchema = z.object({
  body: z.string().min(1, 'Message vide').max(1000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
