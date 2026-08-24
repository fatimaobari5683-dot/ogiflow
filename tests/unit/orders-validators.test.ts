import { describe, it, expect } from 'vitest';
import { createOrderSchema } from '@/modules/orders/orders.validators';

const BASE_INPUT = {
  supplierId: 'supplier-1',
  customer: { fullName: 'Client Test', phone: '+212600000000' },
  address: { fullAddress: '1 Rue Test', city: 'Casablanca' },
  items: [{ productId: 'product-1', quantity: 1 }],
  deliveryFee: 20,
};

describe('createOrderSchema — livraison programmée', () => {
  it('accepte un créneau fixé au moins 2h à l\'avance', () => {
    const result = createOrderSchema.safeParse({
      ...BASE_INPUT,
      scheduledFor: new Date(Date.now() + 3 * 3_600_000).toISOString(),
      scheduledWindowMinutes: 120,
    });
    expect(result.success).toBe(true);
  });

  it('rejette un créneau fixé à moins de 2h', () => {
    const result = createOrderSchema.safeParse({
      ...BASE_INPUT,
      scheduledFor: new Date(Date.now() + 30 * 60_000).toISOString(),
      scheduledWindowMinutes: 120,
    });
    expect(result.success).toBe(false);
  });

  it('rejette scheduledWindowMinutes sans scheduledFor', () => {
    const result = createOrderSchema.safeParse({
      ...BASE_INPUT,
      scheduledWindowMinutes: 120,
    });
    expect(result.success).toBe(false);
  });

  it('sans champs de programmation, reste une commande ASAP valide', () => {
    const result = createOrderSchema.safeParse(BASE_INPUT);
    expect(result.success).toBe(true);
  });
});
