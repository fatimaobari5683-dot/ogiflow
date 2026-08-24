import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures, createDriver, createUser } from '../factories';
import { createOrderForSupplier, transitionOrderStatus } from '@/modules/orders/orders.service';
import { assignDriverToOrder } from '@/modules/dispatch/dispatch.service';
import { advanceDeliveryStatus, recordDeliveryAttempt } from '@/modules/deliveries/deliveries.service';
import {
  detectAndSyncExceptions,
  listExceptions,
  acknowledgeException,
  resolveException,
  triggerDriverSos,
  ExceptionError,
} from '@/modules/operations/exceptions.service';
import { DeliveryError } from '@/modules/deliveries/deliveries.service';

beforeEach(resetDatabase);

async function createOrderAt(status: 'READY_FOR_PICKUP' | 'ASSIGNED') {
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

  if (status === 'ASSIGNED') {
    const { user: driverUser, driver } = await createDriver({ zoneId: fixtures.zone.id });
    await assignDriverToOrder(order.id, driver.id, {});
    return { order, driverUser, driver, ...fixtures };
  }

  return { order, driverUser: null, driver: null, ...fixtures };
}

/**
 * Recule artificiellement TOUT l'historique d'une commande de N minutes pour
 * simuler une commande "bloquée" depuis N minutes sur son statut courant.
 * Décaler uniquement la dernière entrée casserait l'ordre chronologique
 * relatif (les entrées précédentes, créées quelques ms plus tôt en temps
 * réel, deviendraient alors les plus "récentes" une fois la dernière
 * reculée de plusieurs minutes) — décaler tout l'historique du même delta
 * préserve l'ordre et donc quelle entrée le service considère comme actuelle.
 */
async function backdateCurrentStatus(orderId: string, minutesAgo: number) {
  const history = await prisma.orderStatusHistory.findMany({ where: { orderId } });
  await Promise.all(
    history.map((entry) =>
      prisma.orderStatusHistory.update({
        where: { id: entry.id },
        data: { createdAt: new Date(entry.createdAt.getTime() - minutesAgo * 60_000) },
      })
    )
  );
}

describe('detectAndSyncExceptions — seuils SLA', () => {
  it('ne déclenche rien pour une commande bien dans les temps', async () => {
    const { order } = await createOrderAt('READY_FOR_PICKUP');
    await detectAndSyncExceptions();
    const exceptions = await prisma.exception.findMany({ where: { orderId: order.id } });
    expect(exceptions).toHaveLength(0);
  });

  it('SLA_AT_RISK à 70% du seuil (READY_FOR_PICKUP, seuil 15 min)', async () => {
    const { order } = await createOrderAt('READY_FOR_PICKUP');
    await backdateCurrentStatus(order.id, 11); // 73% de 15 min
    await detectAndSyncExceptions();

    const exception = await prisma.exception.findFirstOrThrow({ where: { orderId: order.id } });
    expect(exception.type).toBe('SLA_AT_RISK');
    expect(exception.severity).toBe('MEDIUM');
    expect(exception.status).toBe('OPEN');
  });

  it('SLA_BREACHED au-delà du seuil, avec sévérité CRITICAL', async () => {
    const { order } = await createOrderAt('READY_FOR_PICKUP');
    await backdateCurrentStatus(order.id, 20); // > 15 min
    await detectAndSyncExceptions();

    const exception = await prisma.exception.findFirstOrThrow({ where: { orderId: order.id } });
    expect(exception.type).toBe('SLA_BREACHED');
    expect(exception.severity).toBe('CRITICAL');
  });

  it('ne duplique pas une exception déjà ouverte sur balayages successifs', async () => {
    const { order } = await createOrderAt('READY_FOR_PICKUP');
    await backdateCurrentStatus(order.id, 20);
    await detectAndSyncExceptions();
    await detectAndSyncExceptions();
    await detectAndSyncExceptions();

    const exceptions = await prisma.exception.findMany({ where: { orderId: order.id } });
    expect(exceptions).toHaveLength(1);
  });

  it('résout automatiquement l\'exception quand la commande progresse au-delà du statut incriminé', async () => {
    const { order, zone } = await createOrderAt('READY_FOR_PICKUP');
    await backdateCurrentStatus(order.id, 20);
    await detectAndSyncExceptions();
    const before = await prisma.exception.findFirstOrThrow({ where: { orderId: order.id } });
    expect(before.status).toBe('OPEN');

    const { driver } = await createDriver({ zoneId: zone.id });
    await assignDriverToOrder(order.id, driver.id, {});
    await detectAndSyncExceptions();

    const after = await prisma.exception.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.status).toBe('RESOLVED');
    expect(after.resolution).toMatch(/automatiquement/);
  });
});

describe('detectAndSyncExceptions — échecs répétés', () => {
  it('déclenche REPEATED_FAILURE dès 2 tentatives non SUCCESS, même hors des statuts suivis par SLA', async () => {
    const { order, driverUser } = await createOrderAt('ASSIGNED');

    const ctx = { actorId: driverUser!.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', ctx);
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', ctx);
    await recordDeliveryAttempt(order.id, { ...ctx, result: 'CUSTOMER_ABSENT' });

    // L'échec renvoie la commande en CUSTOMER_ABSENT (hors périmètre SLA) —
    // la 2e tentative se fait après reprogrammation puis nouveau passage
    // par OUT_FOR_DELIVERY.
    await transitionOrderStatus(order.id, 'RESCHEDULED', {});
    await transitionOrderStatus(order.id, 'OUT_FOR_DELIVERY', {});
    await recordDeliveryAttempt(order.id, { ...ctx, result: 'CUSTOMER_ABSENT' });

    await detectAndSyncExceptions();

    const exception = await prisma.exception.findFirstOrThrow({ where: { orderId: order.id, type: 'REPEATED_FAILURE' } });
    expect(exception.severity).toBe('HIGH');
    expect(exception.description).toContain('2 tentatives');
  });
});

describe('acknowledgeException / resolveException', () => {
  it('un manager prend en charge puis résout une exception avec une raison explicite', async () => {
    const { order } = await createOrderAt('READY_FOR_PICKUP');
    await backdateCurrentStatus(order.id, 20);
    await listExceptions(); // déclenche la détection

    const exception = await prisma.exception.findFirstOrThrow({ where: { orderId: order.id } });
    const manager = await createUser('LOGISTICS_MANAGER');

    const acknowledged = await acknowledgeException(exception.id, manager.id);
    expect(acknowledged.status).toBe('ACKNOWLEDGED');
    expect(acknowledged.acknowledgedById).toBe(manager.id);

    const resolved = await resolveException(exception.id, manager.id, 'Livreur assigné manuellement par téléphone.');
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolvedById).toBe(manager.id);
    expect(resolved.resolution).toBe('Livreur assigné manuellement par téléphone.');
  });

  it('refuse de prendre en charge une exception déjà résolue', async () => {
    const { order } = await createOrderAt('READY_FOR_PICKUP');
    await backdateCurrentStatus(order.id, 20);
    await listExceptions();
    const exception = await prisma.exception.findFirstOrThrow({ where: { orderId: order.id } });
    const manager = await createUser('LOGISTICS_MANAGER');

    await resolveException(exception.id, manager.id, 'Traité.');
    await expect(acknowledgeException(exception.id, manager.id)).rejects.toThrow(ExceptionError);
  });
});

describe('triggerDriverSos — alerte d\'urgence', () => {
  it('crée une exception CRITICAL de type DRIVER_SOS', async () => {
    const { order, driverUser } = await createOrderAt('ASSIGNED');

    const sos = await triggerDriverSos(order.id, 'Accident sur la route', { actorId: driverUser!.id, actorRole: 'DRIVER' });
    expect(sos.type).toBe('DRIVER_SOS');
    expect(sos.severity).toBe('CRITICAL');
    expect(sos.description).toContain('Accident sur la route');
  });

  it("un livreur ne peut déclencher une alerte que sur sa propre livraison (IDOR)", async () => {
    const { order } = await createOrderAt('ASSIGNED');
    const { user: intruderUser } = await createDriver();

    await expect(
      triggerDriverSos(order.id, undefined, { actorId: intruderUser.id, actorRole: 'DRIVER' })
    ).rejects.toThrow(DeliveryError);
  });

  it("un manager peut déclencher une alerte pour n'importe quelle livraison", async () => {
    const { order } = await createOrderAt('ASSIGNED');
    const sos = await triggerDriverSos(order.id, undefined, { actorId: 'manager-id', actorRole: 'LOGISTICS_MANAGER' });
    expect(sos.type).toBe('DRIVER_SOS');
  });

  it("n'est JAMAIS auto-résolue par le balayage SLA, contrairement aux exceptions détectées automatiquement", async () => {
    const { order, driverUser } = await createOrderAt('ASSIGNED');
    const sos = await triggerDriverSos(order.id, undefined, { actorId: driverUser!.id, actorRole: 'DRIVER' });

    // Plusieurs balayages successifs (ex: plusieurs chargements du Control
    // Tower) ne doivent jamais refermer une alerte SOS toute seule — régression
    // trouvée en préparant cette fonctionnalité : le filtre d'auto-résolution
    // ne distinguait pas les types qu'il gère de ceux qu'il ignore.
    await detectAndSyncExceptions();
    await detectAndSyncExceptions();

    const stillOpen = await prisma.exception.findUniqueOrThrow({ where: { id: sos.id } });
    expect(stillOpen.status).toBe('OPEN');
  });

  it('apparaît toujours en tête de listExceptions, avant les exceptions de sévérité égale', async () => {
    const { order: slaOrder } = await createOrderAt('READY_FOR_PICKUP');
    await backdateCurrentStatus(slaOrder.id, 20); // SLA_BREACHED, aussi CRITICAL

    const { order: sosOrder, driverUser } = await createOrderAt('ASSIGNED');
    await triggerDriverSos(sosOrder.id, undefined, { actorId: driverUser!.id, actorRole: 'DRIVER' });

    const exceptions = await listExceptions();
    expect(exceptions[0]!.type).toBe('DRIVER_SOS');
  });
});
