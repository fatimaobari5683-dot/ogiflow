import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures, createDriver } from '../factories';
import { createOrderForSupplier, transitionOrderStatus } from '@/modules/orders/orders.service';
import {
  getDispatchCandidates,
  assignDriverToOrder,
  autoAssignBestDriver,
  countIneligibleAvailableDrivers,
  releaseDriverIfIdle,
  DispatchError,
  MAX_CONCURRENT_DELIVERIES,
} from '@/modules/dispatch/dispatch.service';

beforeEach(resetDatabase);

async function createReadyOrder(options: { zoneId?: string; lat?: number; lng?: number } = {}) {
  const fixtures = await createOrderFixtures({ zoneId: options.zoneId });
  const order = await createOrderForSupplier({
    supplierId: fixtures.supplier.id,
    customer: { fullName: 'Client', phone: '+212600100200' },
    address: {
      fullAddress: fixtures.address.fullAddress,
      city: fixtures.address.city,
      zoneId: fixtures.zone.id,
      latitude: options.lat,
      longitude: options.lng,
    },
    items: [{ productId: fixtures.product.id, quantity: 1 }],
    deliveryFee: 20,
  });
  await transitionOrderStatus(order.id, 'CONFIRMED', {});
  await transitionOrderStatus(order.id, 'READY_FOR_PICKUP', {});
  // createOrderForSupplier crée toujours une NOUVELLE adresse (jamais celle
  // des fixtures) — c'est donc order.addressId qu'il faut utiliser pour
  // toute vérification, pas fixtures.address.id.
  return { order, ...fixtures };
}

describe('dispatch — pré-conditions', () => {
  it('refuse de proposer des candidats pour une commande qui n\'est pas READY_FOR_PICKUP', async () => {
    const { supplier, product, address } = await createOrderFixtures();
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client', phone: '+212600100200' },
      address: { fullAddress: address.fullAddress, city: address.city },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 20,
    });
    // encore PENDING, jamais confirmée/préparée
    await expect(getDispatchCandidates(order.id)).rejects.toThrow(DispatchError);
  });

  it("n'assigne jamais un livreur OFFLINE", async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id, status: 'OFFLINE' });

    await expect(assignDriverToOrder(order.id, driver.id, {})).rejects.toThrow(DispatchError);
  });

  it('sans aucun livreur disponible, autoAssignBestDriver échoue explicitement (pas un crash silencieux)', async () => {
    const { order } = await createReadyOrder();
    await expect(autoAssignBestDriver(order.id, {})).rejects.toThrow(DispatchError);
  });
});

describe('dispatch — scoring', () => {
  it('favorise le livreur le plus proche à charge et zone égales', async () => {
    const { order, zone } = await createReadyOrder({ lat: 33.5731, lng: -7.5898 });

    const { driver: near } = await createDriver({ zoneId: zone.id, lat: 33.5732, lng: -7.5899 }); // ~15m
    const { driver: far } = await createDriver({ zoneId: zone.id, lat: 33.62, lng: -7.65 }); // plusieurs km

    const candidates = await getDispatchCandidates(order.id);
    expect(candidates[0]?.driverId).toBe(near.id);
    expect(candidates.find((c) => c.driverId === far.id)?.score).toBeLessThan(
      candidates.find((c) => c.driverId === near.id)!.score
    );
  });

  it('pénalise un livreur déjà chargé (autres livraisons actives)', async () => {
    const { order, zone } = await createReadyOrder();
    const { driver: idle } = await createDriver({ zoneId: zone.id });
    const { driver: loaded } = await createDriver({ zoneId: zone.id });

    // Donne au livreur "loaded" 3 livraisons actives non terminales
    for (let i = 0; i < 3; i++) {
      const other = await createReadyOrder({ zoneId: zone.id });
      await assignDriverToOrder(other.order.id, loaded.id, {});
      await prisma.driver.update({ where: { id: loaded.id }, data: { status: 'AVAILABLE' } }); // libère pour le prochain tour
    }
    await prisma.driver.update({ where: { id: loaded.id }, data: { status: 'AVAILABLE' } });

    const candidates = await getDispatchCandidates(order.id);
    const idleScore = candidates.find((c) => c.driverId === idle.id)?.score ?? 0;
    const loadedScore = candidates.find((c) => c.driverId === loaded.id)?.score ?? 0;
    expect(idleScore).toBeGreaterThan(loadedScore);
  });

  it('bonifie un livreur couvrant la zone de la commande par rapport à un livreur hors zone', async () => {
    const { order, zone } = await createReadyOrder();
    const otherZone = await prisma.zone.create({ data: { name: `Autre-${Date.now()}`, city: 'Rabat' } });

    const { driver: inZone } = await createDriver({ zoneId: zone.id });
    const { driver: outOfZone } = await createDriver({ zoneId: otherZone.id });

    const candidates = await getDispatchCandidates(order.id);
    const inZoneCandidate = candidates.find((c) => c.driverId === inZone.id);
    const outOfZoneCandidate = candidates.find((c) => c.driverId === outOfZone.id);

    expect(inZoneCandidate?.zoneMatch).toBe(true);
    expect(outOfZoneCandidate?.zoneMatch).toBe(false);
    expect(inZoneCandidate!.score).toBeGreaterThan(outOfZoneCandidate!.score);
  });

  it('assignDriverToOrder passe le livreur en BUSY et la commande en ASSIGNED de façon atomique', async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id });

    const result = await assignDriverToOrder(order.id, driver.id, {});

    expect(result.order.status).toBe('ASSIGNED');
    const updatedDriver = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(updatedDriver.status).toBe('BUSY');

    const delivery = await prisma.delivery.findUnique({ where: { orderId: order.id } });
    expect(delivery?.driverId).toBe(driver.id);
    expect(delivery?.assignedAt).not.toBeNull();
  });
});

describe('dispatch — multi-arrêts (capacité livreur)', () => {
  it('un livreur BUSY sous sa capacité reste candidat pour une commande supplémentaire', async () => {
    const { order: firstOrder, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id });
    await assignDriverToOrder(firstOrder.id, driver.id, {});

    const updatedDriver = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(updatedDriver.status).toBe('BUSY');

    const { order: secondOrder } = await createReadyOrder({ zoneId: zone.id });
    const candidates = await getDispatchCandidates(secondOrder.id);
    expect(candidates.map((c) => c.driverId)).toContain(driver.id);

    const result = await assignDriverToOrder(secondOrder.id, driver.id, {});
    expect(result.order.status).toBe('ASSIGNED');

    const activeLoad = await prisma.delivery.count({ where: { driverId: driver.id } });
    expect(activeLoad).toBe(2);
  });

  it("un livreur qui a atteint sa capacité maximale disparaît des candidats et ne peut plus être assigné", async () => {
    const { zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id });

    for (let i = 0; i < MAX_CONCURRENT_DELIVERIES; i += 1) {
      const { order } = await createReadyOrder({ zoneId: zone.id });
      await assignDriverToOrder(order.id, driver.id, {});
    }

    const { order: overflowOrder } = await createReadyOrder({ zoneId: zone.id });
    const candidates = await getDispatchCandidates(overflowOrder.id);
    expect(candidates.map((c) => c.driverId)).not.toContain(driver.id);

    await expect(assignDriverToOrder(overflowOrder.id, driver.id, {})).rejects.toThrow(DispatchError);
  });

  it('releaseDriverIfIdle ne libère le livreur qu\'une fois TOUTES ses livraisons actives terminées', async () => {
    const { order: firstOrder, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id });
    await assignDriverToOrder(firstOrder.id, driver.id, {});
    const { order: secondOrder } = await createReadyOrder({ zoneId: zone.id });
    await assignDriverToOrder(secondOrder.id, driver.id, {});

    // Une des deux commandes atteint un état terminal (simulé directement,
    // hors sujet ici) — le livreur porte encore l'autre, il doit rester BUSY.
    await prisma.order.update({ where: { id: firstOrder.id }, data: { status: 'CANCELLED' } });
    await releaseDriverIfIdle(driver.id);
    let updated = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(updated.status).toBe('BUSY');

    await prisma.order.update({ where: { id: secondOrder.id }, data: { status: 'CANCELLED' } });
    await releaseDriverIfIdle(driver.id);
    updated = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(updated.status).toBe('AVAILABLE');
  });
});

describe('dispatch — conformité documentaire (Compliance Engine)', () => {
  it("un livreur AVAILABLE sans documents n'apparaît jamais parmi les candidats (silencieusement exclu)", async () => {
    const { order, zone } = await createReadyOrder();
    const { driver: compliant } = await createDriver({ zoneId: zone.id });
    const { driver: nonCompliant } = await createDriver({ zoneId: zone.id, withDocuments: false });

    const candidates = await getDispatchCandidates(order.id);
    expect(candidates.map((c) => c.driverId)).toContain(compliant.id);
    expect(candidates.map((c) => c.driverId)).not.toContain(nonCompliant.id);
  });

  it("assignDriverToOrder refuse un livreur choisi manuellement mais non conforme", async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id, withDocuments: false });

    await expect(assignDriverToOrder(order.id, driver.id, {})).rejects.toThrow(DispatchError);
  });

  it("autoAssignBestDriver échoue explicitement si le seul livreur disponible n'est pas conforme (pas de fallback silencieux)", async () => {
    const { order, zone } = await createReadyOrder();
    await createDriver({ zoneId: zone.id, withDocuments: false });

    await expect(autoAssignBestDriver(order.id, {})).rejects.toThrow(DispatchError);
  });

  it("un document VERIFIED mais expiré exclut le livreur au même titre qu'un document manquant", async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id });

    // Fait expirer hier l'un des documents obligatoires posés par la factory.
    await prisma.document.updateMany({
      where: { ownerType: 'DRIVER', ownerId: driver.id, type: 'VEHICLE_INSURANCE' },
      data: { expiresAt: new Date(Date.now() - 86_400_000) },
    });

    const candidates = await getDispatchCandidates(order.id);
    expect(candidates.map((c) => c.driverId)).not.toContain(driver.id);
  });

  it('countIneligibleAvailableDrivers compte les livreurs AVAILABLE non conformes, indépendamment de la commande', async () => {
    const { zone } = await createReadyOrder();
    await createDriver({ zoneId: zone.id }); // conforme
    await createDriver({ zoneId: zone.id, withDocuments: false }); // non conforme
    await createDriver({ zoneId: zone.id, withDocuments: false, status: 'OFFLINE' }); // non conforme mais pas AVAILABLE — ne compte pas

    expect(await countIneligibleAvailableDrivers()).toBe(1);
  });
});

describe('dispatch — signal de position obsolète (heartbeat)', () => {
  it("un livreur sans lastLocationUpdate est marqué locationStale, mais reste candidat (signal informatif, pas un filtre)", async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id }); // pas de lat/lng → lastLocationUpdate jamais posé

    const candidates = await getDispatchCandidates(order.id);
    const candidate = candidates.find((c) => c.driverId === driver.id);
    expect(candidate).toBeDefined();
    expect(candidate?.locationStale).toBe(true);
  });

  it('un livreur avec une position récente (< 20 min) n\'est pas marqué locationStale', async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id, lat: 33.5731, lng: -7.5898 }); // factory pose lastLocationUpdate = now

    const candidates = await getDispatchCandidates(order.id);
    const candidate = candidates.find((c) => c.driverId === driver.id);
    expect(candidate?.locationStale).toBe(false);
  });

  it('une position vieille de plus de 20 minutes redevient locationStale', async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id, lat: 33.5731, lng: -7.5898 });
    await prisma.driver.update({ where: { id: driver.id }, data: { lastLocationUpdate: new Date(Date.now() - 25 * 60_000) } });

    const candidates = await getDispatchCandidates(order.id);
    const candidate = candidates.find((c) => c.driverId === driver.id);
    expect(candidate?.locationStale).toBe(true);
  });
});
