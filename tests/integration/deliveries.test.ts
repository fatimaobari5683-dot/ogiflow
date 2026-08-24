import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '../db';
import { createOrderFixtures, createDriver, createUser } from '../factories';
import { createOrderForSupplier, transitionOrderStatus } from '@/modules/orders/orders.service';
import { assignDriverToOrder } from '@/modules/dispatch/dispatch.service';
import { advanceDeliveryStatus, recordDeliveryAttempt, DeliveryError } from '@/modules/deliveries/deliveries.service';

beforeEach(resetDatabase);

async function createAssignedOrder() {
  const fixtures = await createOrderFixtures();
  const order = await createOrderForSupplier({
    supplierId: fixtures.supplier.id,
    customer: { fullName: 'Client', phone: '+212600100200' },
    address: { fullAddress: fixtures.address.fullAddress, city: fixtures.address.city, zoneId: fixtures.zone.id },
    items: [{ productId: fixtures.product.id, quantity: 1 }],
    deliveryFee: 20,
  });
  await transitionOrderStatus(order.id, 'CONFIRMED', {});
  await transitionOrderStatus(order.id, 'READY_FOR_PICKUP', {});
  const { user: driverUser, driver } = await createDriver({ zoneId: fixtures.zone.id });
  await assignDriverToOrder(order.id, driver.id, {});
  return { order, driverUser, driver, ...fixtures };
}

describe('deliveries — isolation entre livreurs (protection IDOR)', () => {
  it("un livreur ne peut PAS faire avancer le statut d'une livraison assignée à un autre livreur", async () => {
    const { order } = await createAssignedOrder();
    const { user: intruderUser } = await createDriver(); // livreur sans lien avec cette commande

    await expect(
      advanceDeliveryStatus(order.id, 'PICKED_UP', { actorId: intruderUser.id, actorRole: 'DRIVER' })
    ).rejects.toThrow(DeliveryError);
  });

  it("un livreur ne peut PAS enregistrer une tentative de livraison pour une commande qui n'est pas la sienne", async () => {
    const { order, driverUser } = await createAssignedOrder();
    await advanceDeliveryStatus(order.id, 'PICKED_UP', { actorId: driverUser.id, actorRole: 'DRIVER' });
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', { actorId: driverUser.id, actorRole: 'DRIVER' });
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', { actorId: driverUser.id, actorRole: 'DRIVER' });

    const { user: intruderUser } = await createDriver();
    await expect(
      recordDeliveryAttempt(order.id, {
        actorId: intruderUser.id,
        actorRole: 'DRIVER',
        result: 'SUCCESS',
        proof: { type: 'OTP', data: { code: '000000' } },
      })
    ).rejects.toThrow(DeliveryError);
  });

  it('un manager (actorRole non-DRIVER) peut agir sur n\'importe quelle livraison — override légitime', async () => {
    const { order } = await createAssignedOrder();
    const manager = await createUser('LOGISTICS_MANAGER');
    // Pas de actorRole 'DRIVER' → traité comme un manager, aucune vérification de propriété.
    await expect(
      advanceDeliveryStatus(order.id, 'PICKED_UP', { actorId: manager.id, actorRole: 'LOGISTICS_MANAGER' })
    ).resolves.toMatchObject({ status: 'PICKED_UP' });
  });
});

describe('deliveries — preuve de livraison obligatoire', () => {
  it('refuse une livraison SUCCESS sans preuve de livraison', async () => {
    const { order, driverUser } = await createAssignedOrder();
    const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', ctx);
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', ctx);

    await expect(recordDeliveryAttempt(order.id, { ...ctx, result: 'SUCCESS' })).rejects.toThrow(DeliveryError);
  });

  it("un échec de livraison n'exige aucune preuve", async () => {
    const { order, driverUser } = await createAssignedOrder();
    const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', ctx);
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', ctx);

    const result = await recordDeliveryAttempt(order.id, { ...ctx, result: 'CUSTOMER_ABSENT' });
    expect(result.status).toBe('CUSTOMER_ABSENT');
  });

  it('un OTHER_FAILURE non qualifié atterrit sur RESCHEDULED, pas un échec définitif', async () => {
    const { order, driverUser } = await createAssignedOrder();
    const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', ctx);
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', ctx);

    const result = await recordDeliveryAttempt(order.id, { ...ctx, result: 'OTHER_FAILURE' });
    expect(result.status).toBe('RESCHEDULED');
  });
});

describe('deliveries — la state machine des commandes reste la seule autorité', () => {
  it('refuse advanceDeliveryStatus vers PICKED_UP si la commande est encore ASSIGNED→...→déjà PICKED_UP (transition déjà faite)', async () => {
    const { order, driverUser } = await createAssignedOrder();
    const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);

    // Rejouer la même transition doit échouer (PICKED_UP → PICKED_UP n'existe pas dans la state machine)
    await expect(advanceDeliveryStatus(order.id, 'PICKED_UP', ctx)).rejects.toThrow();
  });
});
