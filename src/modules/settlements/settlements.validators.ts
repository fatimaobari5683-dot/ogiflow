import { z } from 'zod';

export const generateSettlementSchema = z
  .object({
    supplierId: z.string().min(1),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
  })
  .refine((data) => data.periodStart < data.periodEnd, {
    message: 'periodStart doit être antérieur à periodEnd.',
    path: ['periodEnd'],
  });

export const listSettlementsQuerySchema = z.object({
  supplierId: z.string().optional(),
  status: z.enum(['DRAFT', 'PENDING_PAYMENT', 'PAID', 'DISPUTED']).optional(),
});

export type GenerateSettlementInput = z.infer<typeof generateSettlementSchema>;
export type ListSettlementsQuery = z.infer<typeof listSettlementsQuerySchema>;
