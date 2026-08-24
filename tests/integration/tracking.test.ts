import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures, createDriver } from '../factories';
import { registerAllEventHandlers } from '../register-events';
import { createOrderForSupplier, transitionOrderStatus } from '@/modules/orders/orders.service';
import { autoAssignBestDriver } from '@/modules/dispatch/dispatch.service';
import { advanceDeliveryStatus, recordDeliveryAttempt } from '@/modules/deliveries/deliveries.service';
import { getPublicTracking, submitDeliveryReview, TrackingError } from '@/modules/tracking/tracking.service';

beforeAll(registerAllEventHandlers);
beforeEach(resetDatabase);

async function buildOrderUpTo(status?: 'OUT_FOR_DELIVERY' | 'DELIVERED') {
  const { supplier, product, address } = await createOrderFixtures();
  const { user: driverUser, driver } = await createDriver({
    zoneId: address.zoneId ?? undefined,
    lat: 33.5731,
    lng: -7.5898,
  });
  const order = await createOrderForSupplier({
    supplierId: supplier.id,
    customer: { fullName: 'Client Tracking', phone: '+212677000001' },
    address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
    items: [{ productId: product.id, quantity: 1 }],
    deliveryFee: 15,
  });

  if (!status) return { order, driver, driverUser };

  await transitionOrderStatus(order.id, 'CONFIRMED', {});
  await transitionOrderStatus(order.id, 'READY_FOR_PICKUP', {});
  await autoAssignBestDriver(order.id, {});
  const driverContext = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
  await advanceDeliveryStatus(order.id, 'PICKED_UP', driverContext);
  await advanceDeliveryStatus(order.id, 'IN_TRANSIT', driverContext);
  await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', driverContext);

  if (status === 'DELIVERED') {
    await recordDeliveryAttempt(order.id, {
      ...driverContext,
      result: 'SUCCESS',
      proof: { type: 'OTP', data: { code: '482913', otpVerified: true } },
    });
  }

  return { order, driver, driverUser, driverContext };
}

describe('getPublicTracking — itinéraire et ETA client', () => {
  it('renvoie une erreur pour une commande inconnue', async () => {
    await expect(getPublicTracking('ORD-INCONNU')).rejects.toThrow(TrackingError);
  });

  it("n'expose ni ETA ni position tant que la commande n'est pas OUT_FOR_DELIVERY", async () => {
    const { order } = await buildOrderUpTo();
    const tracking = await getPublicTracking(order.orderNumber);
    expect(tracking.eta).toBeNull();
    expect(tracking.driverPosition).toBeNull();
  });

  it('expose une ETA et la position fraîche du livreur pendant OUT_FOR_DELIVERY', async () => {
    const { order } = await buildOrderUpTo('OUT_FOR_DELIVERY');
    const tracking = await getPublicTracking(order.orderNumber);

    expect(tracking.status).toBe('OUT_FOR_DELIVERY');
    expect(tracking.eta).not.toBeNull();
    expect(new Date(tracking.eta!).getTime()).toBeGreaterThan(Date.now());
    expect(tracking.driverPosition).toEqual({ lat: 33.5731, lng: -7.5898 });
  });

  it('ne renvoie pas la position du livreur si elle est obsolète (> 20 min)', async () => {
    const { order, driver } = await buildOrderUpTo('OUT_FOR_DELIVERY');
    await prisma.driver.update({
      where: { id: driver.id },
      data: { lastLocationUpdate: new Date(Date.now() - 25 * 60_000) },
    });

    const tracking = await getPublicTracking(order.orderNumber);
    expect(tracking.driverPosition).toBeNull();
  });

  it("ne renvoie jamais l'adresse de livraison — numéro de commande devinable/énumérable", async () => {
    const { order } = await buildOrderUpTo('OUT_FOR_DELIVERY');
    const tracking = await getPublicTracking(order.orderNumber);
    expect(tracking).not.toHaveProperty('address');
    expect(tracking).not.toHaveProperty('destination');
  });
});

describe('notification client à OUT_FOR_DELIVERY', () => {
  it("notifie le client avec une heure d'arrivée estimée (etaAt)", async () => {
    await buildOrderUpTo('OUT_FOR_DELIVERY');

    const notif = await prisma.notification.findFirst({
      where: { event: 'ORDER_OUT_FOR_DELIVERY' },
      orderBy: { createdAt: 'desc' },
    });

    expect(notif).toBeDefined();
    const payload = notif!.payload as Record<string, unknown>;
    expect(payload.etaAt).toBeDefined();
    expect(new Date(payload.etaAt as string).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('submitDeliveryReview — avis client post-livraison', () => {
  it("refuse un avis sur une commande pas encore livrée", async () => {
    const { order } = await buildOrderUpTo('OUT_FOR_DELIVERY');
    await expect(submitDeliveryReview(order.orderNumber, 5)).rejects.toThrow(TrackingError);
  });

  it('enregistre un avis une fois la commande DELIVERED, rattaché au livreur', async () => {
    const { order, driver } = await buildOrderUpTo('DELIVERED');

    const review = await submitDeliveryReview(order.orderNumber, 4, 'Livreur ponctuel');
    expect(review.rating).toBe(4);
    expect(review.driverId).toBe(driver.id);

    const tracking = await getPublicTracking(order.orderNumber);
    expect(tracking.review).toMatchObject({ rating: 4, comment: 'Livreur ponctuel' });
  });

  it('refuse un second avis pour la même commande', async () => {
    const { order } = await buildOrderUpTo('DELIVERED');
    await submitDeliveryReview(order.orderNumber, 5);
    await expect(submitDeliveryReview(order.orderNumber, 2)).rejects.toThrow(TrackingError);
  });
});
