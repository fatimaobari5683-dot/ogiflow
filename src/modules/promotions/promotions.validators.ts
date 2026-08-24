import { z } from 'zod';

export const createPromoCodeSchema = z.object({
  code: z.string().min(3).max(30),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  discountValue: z.number().positive(),
  maxDiscount: z.number().positive().optional(),
  minOrderAmount: z.number().nonnegative().optional(),
  expiresAt: z.string().datetime().optional(),
  usageLimit: z.number().int().positive().optional(),
});

export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>;
