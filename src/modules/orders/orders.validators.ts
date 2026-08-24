import { z } from 'zod';
import { phoneSchema } from '@/modules/auth/auth.validators';

export const createOrderSchema = z.object({
  supplierId: z.string().min(1),
  customer: z.object({
    fullName: z.string().min(2).max(150),
    phone: phoneSchema,
    email: z.string().email().optional(),
  }),
  address: z.object({
    label: z.string().max(50).optional(),
    fullAddress: z.string().min(3).max(300),
    city: z.string().min(1).max(100),
    zoneId: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive() }))
    .min(1, 'Une commande doit contenir au moins un article.'),
  deliveryFee: z.number().nonnegative(),
  instructions: z.string().max(500).optional(),
  promoCode: z.string().min(1).max(30).optional(),
});

export const listOrdersQuerySchema = z.object({
  supplierId: z.string().optional(),
  status: z
    .enum([
      'PENDING',
      'CONFIRMED',
      'READY_FOR_PICKUP',
      'ASSIGNED',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CUSTOMER_ABSENT',
      'WRONG_ADDRESS',
      'CUSTOMER_REFUSED',
      'RESCHEDULED',
      'RETURNED',
      'CANCELLED',
    ])
    .optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'READY_FOR_PICKUP', 'CANCELLED']),
  reason: z.string().max(500).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
