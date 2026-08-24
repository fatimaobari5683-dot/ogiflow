import { z } from 'zod';

export const createProductSchema = z.object({
  sku: z.string().max(50).optional(),
  name: z.string().min(2).max(150),
  description: z.string().max(1000).optional(),
  price: z.number().positive(),
  weightKg: z.number().positive().optional(),
});

export const updateProductSchema = z.object({
  sku: z.string().max(50).optional(),
  name: z.string().min(2).max(150).optional(),
  description: z.string().max(1000).optional(),
  price: z.number().positive().optional(),
  weightKg: z.number().positive().optional(),
  isActive: z.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
