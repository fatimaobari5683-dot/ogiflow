import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures, createDriver } from '../factories';
import { registerAllEventHandlers } from '../register-events';
import { createOrderForSupplier, transitionOrderStatus } from '@/modules/orders/orders.service';
import { autoAssignBestDriver } from '@/modules/dispatch/dispatch.service';
import { advanceDeliveryStatus, recordDeliveryAttempt } from '@/modules/deliveries/deliveries.service';
import { getPublicTracking, submitDeliveryReview, TrackingError } from '@/modules/tracking/tracking.service';
import { resetRateLimiterStateForTests } from '@/infrastructure/rate-limit/rate-limiter';
import { GET as trackingRoute } from '@/app/api/v1/tracking/[orderNumber]/route';
import { POST as reviewRoute } from '@/app/api/v1/tracking/[orderNumber]/review/route';

beforeAll(registerAllEventHandlers);
beforeEach(async () => {
  await resetDatabase();
  // Voir auth.test.ts / rate-limiter.ts : le singleton `global.*` survit
  // entre tests, doit être vidé explicitement.
  resetRateLimiterStateForTests();
});

function buildTrackingRequest(ip = '10.1.0.1') {
  return new NextRequest('http://localhost/api/v1/tracking/ORD-TEST', {
    headers: { 'x-forwarded-for': ip },
  });
}

function buildReviewRequest(body: unknown, ip = '10.1.0.1') {
  return new NextRequest('http://localhost/api/v1/tracking/ORD-TEST/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

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
      proof: { type: 'OTP', value: '482913' },
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

describe('GET /api/v1/tracking/[orderNumber] — rate limiting', () => {
  it('sous la limite (30/min/IP), le comportement existant est préservé', async () => {
    const { order } = await buildOrderUpTo('OUT_FOR_DELIVERY');
    const ip = '10.2.0.1';
    for (let i = 0; i < 5; i++) {
      const res = await trackingRoute(buildTrackingRequest(ip), { params: { orderNumber: order.orderNumber } });
      expect(res.status).toBe(200);
    }
  });

  it('la 31e requête dans la fenêtre est bloquée (429)', async () => {
    const { order } = await buildOrderUpTo('OUT_FOR_DELIVERY');
    const ip = '10.2.0.2';
    for (let i = 0; i < 30; i++) {
      const res = await trackingRoute(buildTrackingRequest(ip), { params: { orderNumber: order.orderNumber } });
      expect(res.status).toBe(200);
    }
    const blocked = await trackingRoute(buildTrackingRequest(ip), { params: { orderNumber: order.orderNumber } });
    expect(blocked.status).toBe(429);
  });

  it('une IP différente dispose de son propre bucket, indépendant', async () => {
    const { order } = await buildOrderUpTo('OUT_FOR_DELIVERY');
    const ipA = '10.2.0.3';
    const ipB = '10.2.0.4';
    for (let i = 0; i < 30; i++) {
      await trackingRoute(buildTrackingRequest(ipA), { params: { orderNumber: order.orderNumber } });
    }
    const blockedOnA = await trackingRoute(buildTrackingRequest(ipA), { params: { orderNumber: order.orderNumber } });
    expect(blockedOnA.status).toBe(429);

    const stillOkOnB = await trackingRoute(buildTrackingRequest(ipB), { params: { orderNumber: order.orderNumber } });
    expect(stillOkOnB.status).toBe(200);
  });

  it('le comportement 404 pour une commande inconnue reste inchangé sous la limite', async () => {
    const res = await trackingRoute(buildTrackingRequest('10.2.0.5'), { params: { orderNumber: 'ORD-INCONNU-XYZ' } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Commande introuvable.' });
  });
});

describe('POST /api/v1/tracking/[orderNumber]/review — rate limiting', () => {
  it('sous la limite (10/10min/IP), le comportement existant est préservé', async () => {
    const { order: orderA } = await buildOrderUpTo('DELIVERED');
    const { order: orderB } = await buildOrderUpTo('DELIVERED');
    const ip = '10.3.0.1';

    const resA = await reviewRoute(buildReviewRequest({ rating: 5 }, ip), { params: { orderNumber: orderA.orderNumber } });
    expect(resA.status).toBe(201);
    const resB = await reviewRoute(buildReviewRequest({ rating: 4 }, ip), { params: { orderNumber: orderB.orderNumber } });
    expect(resB.status).toBe(201);
  });

  it('la 11e requête dans la fenêtre est bloquée (429), quel que soit le résultat métier des précédentes', async () => {
    const { order } = await buildOrderUpTo('DELIVERED');
    const ip = '10.3.0.2';

    // 1ʳᵉ requête : avis réellement créé (201). Les 9 suivantes visent la
    // même commande déjà notée — refusées par la règle métier existante
    // (409), mais comptent quand même dans le bucket de rate-limit (voir
    // rate-limiter.ts : "toutes les tentatives comptent").
    const first = await reviewRoute(buildReviewRequest({ rating: 5 }, ip), { params: { orderNumber: order.orderNumber } });
    expect(first.status).toBe(201);
    for (let i = 0; i < 9; i++) {
      const res = await reviewRoute(buildReviewRequest({ rating: 3 }, ip), { params: { orderNumber: order.orderNumber } });
      expect(res.status).toBe(409); // "Un avis a déjà été enregistré..." — comportement métier inchangé
    }

    const blocked = await reviewRoute(buildReviewRequest({ rating: 3 }, ip), { params: { orderNumber: order.orderNumber } });
    expect(blocked.status).toBe(429);
  });

  it('Retry-After est présent en en-tête HTTP ET dans le corps JSON', async () => {
    const { order } = await buildOrderUpTo('DELIVERED');
    const ip = '10.3.0.3';
    for (let i = 0; i < 10; i++) {
      await reviewRoute(buildReviewRequest({ rating: 3 }, ip), { params: { orderNumber: order.orderNumber } });
    }
    const blocked = await reviewRoute(buildReviewRequest({ rating: 3 }, ip), { params: { orderNumber: order.orderNumber } });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    const body = await blocked.json();
    expect(body.retryAfterSeconds).toBe(Number(blocked.headers.get('Retry-After')));
  });
});
