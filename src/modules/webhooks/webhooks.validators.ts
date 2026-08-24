import { z } from 'zod';

export const setWebhookSchema = z.object({
  url: z.string().trim().url('URL invalide').nullable(),
});

export type SetWebhookInput = z.infer<typeof setWebhookSchema>;
