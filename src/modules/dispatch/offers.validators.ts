import { z } from 'zod';

export const createOfferSchema = z.object({
  driverId: z.string().min(1),
});

export type CreateOfferInput = z.infer<typeof createOfferSchema>;
