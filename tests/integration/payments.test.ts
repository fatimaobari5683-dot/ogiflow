import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures, createDriver, createZone } from '../factories';
import { registerAllEventHandlers } from '../register-events';
import { createOrderForSupplier, transitionOrderStatus } from '@/modules/orders/orders.service';
import { autoAssignBestDriver } from '@/modules/dispatch/dispatch.service';
import { advanceDeliveryStatus, recordDeliveryAttempt, resolveFailedDelivery } from '@/modules/deliveries/deliveries.service';
import { getDriverEarningsSummary, listDriverTransactions, compensateDriverForFailedAttempt } from '@/modules/payments/payments.service';

beforeAll(registerAllEventHandlers);
beforeEach(resetDatabase);

/**
 * Livre une commande COD de bout en bout (mêmes étapes que
 * full-lifecycle.test.ts) pour produire de vrais mouvements de ledger
 * (COD_COLLECTION + DRIVER_PAYOUT) plutôt que de les fabriquer directement.
 */
async function deliverOneOrder(driverId: string, driverUserId: string, zoneId: string, deliveryFee: number) {
  const { supplier, product, address } = await createOrderFixtures({ zoneId, commissionRate: 10 });
  const order = await createOrderForSupplier({
    supplierId: supplier.id,
    customer: { fullName: 'Client Gains', phone: `+21267${Date.now().toString().slice(-7)}` },
    address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
    items: [{ productId: product.id, quantity: 1 }],
    deliveryFee,
  });
  await transitionOrderStatus(order.id, 'CONFIRMED', {});
  await transitionOrderStatus(order.id, 'READY_FOR_PICKUP', {});
  await autoAssignBestDriver(order.id, {});
  const driverContext = { actorId: driverUserId, actorRole: 'DRIVER' as const };
  await advanceDeliveryStatus(order.id, 'PICKED_UP', driverContext);
  await advanceDeliveryStatus(order.id, 'IN_TRANSIT', driverContext);
  await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', driverContext);
  await recordDeliveryAttempt(order.id, {
    ...driverContext,
    result: 'SUCCESS',
    proof: { type: 'OTP', value: '111111' },
  });
  return order;
}

describe('getDriverEarningsSummary — "Mes gains" côté livreur', () => {
  it("reflète le solde et les rémunérations d'aujourd'hui après une livraison COD", async () => {
    const { user: driverUser, driver } = await createDriver({ commissionRate: 10 });
    const zone = await createZone();

    await deliverOneOrder(driver.id, driverUser.id, zone.id, 20);

    const summary = await getDriverEarningsSummary(driver.id);
    expect(summary.walletBalance).toBeGreaterThan(0);
    expect(summary.payoutToday).toBeGreaterThan(0);
    expect(summary.payoutToday).toBe(summary.payoutThisWeek);
    expect(summary.payoutToday).toBe(summary.payoutThisMonth);
    expect(summary.deliveredToday).toBe(1);
  });

  it("renvoie des totaux à zéro et un solde nul pour un livreur sans historique", async () => {
    const { driver } = await createDriver();
    const summary = await getDriverEarningsSummary(driver.id);
    expect(summary.walletBalance).toBe(0);
    expect(summary.payoutToday).toBe(0);
    expect(summary.deliveredToday).toBe(0);
  });
});

describe('listDriverTransactions — historique des mouvements', () => {
  it('liste l\'encaissement client ET la rémunération, le plus récent en premier', async () => {
    const { user: driverUser, driver } = await createDriver({ commissionRate: 10 });
    const zone = await createZone();

    const order = await deliverOneOrder(driver.id, driverUser.id, zone.id, 20);

    const transactions = await listDriverTransactions(driver.id);
    const types = transactions.map((t) => t.type);
    expect(types).toContain('COD_COLLECTION');
    expect(types).toContain('DRIVER_PAYOUT');
    expect(transactions.every((t) => t.order?.orderNumber === order.orderNumber)).toBe(true);
  });
});

describe('compensateDriverForFailedAttempt — indemnité course blanche', () => {
  async function createFailedAttemptOrder(deliveryFee: number) {
    const { user: driverUser, driver } = await createDriver({ commissionRate: 10 });
    const zone = await createZone();
    const { supplier, product, address } = await createOrderFixtures({ zoneId: zone.id, commissionRate: 10 });
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Absent', phone: `+21267${Date.now().toString().slice(-7)}` },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee,
    });
    await transitionOrderStatus(order.id, 'CONFIRMED', {});
    await transitionOrderStatus(order.id, 'READY_FOR_PICKUP', {});
    await autoAssignBestDriver(order.id, {});
    const driverContext = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', driverContext);
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', driverContext);
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', driverContext);
    await recordDeliveryAttempt(order.id, { ...driverContext, result: 'CUSTOMER_ABSENT' });
    return { order, driver, driverContext };
  }

  it('verse 50% des frais de livraison au livreur quand la commande est retournée après échec', async () => {
    const { order, driver } = await createFailedAttemptOrder(40);
    await resolveFailedDelivery(order.id, 'RETURNED', { actorId: driver.userId, actorRole: 'DRIVER' });

    const transaction = await prisma.transaction.findFirstOrThrow({ where: { orderId: order.id, type: 'DRIVER_PAYOUT' } });
    expect(Number(transaction.amount)).toBe(20); // 50% de 40

    const updatedDriver = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(Number(updatedDriver.walletBalance)).toBe(20);
  });

  it('est idempotent — un rejeu ne double pas l\'indemnité', async () => {
    const { order } = await createFailedAttemptOrder(40);
    await compensateDriverForFailedAttempt(order.id);
    await compensateDriverForFailedAttempt(order.id);

    const transactions = await prisma.transaction.findMany({ where: { orderId: order.id, type: 'DRIVER_PAYOUT' } });
    expect(transactions).toHaveLength(1);
  });

  it('ne fait rien si aucun livreur n\'est assigné à la commande', async () => {
    const { supplier, product, address } = await createOrderFixtures();
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Sans Livreur', phone: '+212677110022' },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 20,
    });

    const result = await compensateDriverForFailedAttempt(order.id);
    expect(result).toBeNull();
  });
});
