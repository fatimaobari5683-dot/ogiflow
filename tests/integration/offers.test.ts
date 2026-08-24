import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures, createDriver } from '../factories';
import { createOrderForSupplier, transitionOrderStatus } from '@/modules/orders/orders.service';
import {
  createOffer,
  acceptOffer,
  rejectOffer,
  offerToNextBestDriver,
  OfferError,
  OFFER_TTL_SECONDS,
} from '@/modules/dispatch/offers.service';

beforeEach(resetDatabase);

async function createReadyOrder(zoneId?: string) {
  const fixtures = await createOrderFixtures({ zoneId });
  const order = await createOrderForSupplier({
    supplierId: fixtures.supplier.id,
    customer: { fullName: 'Client', phone: '+212600100200' },
    address: { fullAddress: fixtures.address.fullAddress, city: fixtures.address.city, zoneId: fixtures.zone.id },
    items: [{ productId: fixtures.product.id, quantity: 1 }],
    deliveryFee: 20,
  });
  await transitionOrderStatus(order.id, 'CONFIRMED', {});
  await transitionOrderStatus(order.id, 'READY_FOR_PICKUP', {});
  return { order, ...fixtures };
}

describe('createOffer — ne force jamais l\'assignation', () => {
  it('crée une offre PENDING sans changer le statut du livreur ni de la commande', async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id });

    const offer = await createOffer(order.id, driver.id);

    expect(offer.status).toBe('PENDING');
    const untouchedDriver = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    const untouchedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouchedDriver.status).toBe('AVAILABLE');
    expect(untouchedOrder.status).toBe('READY_FOR_PICKUP');
  });

  it("refuse une deuxième offre PENDING vers un livreur qui n'a pas encore répondu", async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id });
    const otherOrder = await createReadyOrder(zone.id);

    await createOffer(order.id, driver.id);
    await expect(createOffer(otherOrder.order.id, driver.id)).rejects.toThrow(OfferError);
  });

  it("refuse une offre vers un livreur non disponible", async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id, status: 'BUSY' });

    await expect(createOffer(order.id, driver.id)).rejects.toThrow(OfferError);
  });
});

describe('acceptOffer', () => {
  it('assigne réellement la commande (délègue à assignDriverToOrder) et périme les autres offres PENDING', async () => {
    const { order, zone } = await createReadyOrder();
    const { user: driverUser, driver } = await createDriver({ zoneId: zone.id });
    const { driver: otherDriver } = await createDriver({ zoneId: zone.id, status: 'OFFLINE' });
    await prisma.driver.update({ where: { id: otherDriver.id }, data: { status: 'AVAILABLE' } });

    const offer = await createOffer(order.id, driver.id);
    // Une deuxième offre concurrente sur la même commande, à un autre livreur
    const otherOffer = await createOffer(order.id, otherDriver.id);

    const result = await acceptOffer(offer.id, { actorId: driverUser.id, actorRole: 'DRIVER' });

    expect(result.order.status).toBe('ASSIGNED');
    const busyDriver = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(busyDriver.status).toBe('BUSY');

    const acceptedOffer = await prisma.driverOffer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(acceptedOffer.status).toBe('ACCEPTED');

    const supersededOffer = await prisma.driverOffer.findUniqueOrThrow({ where: { id: otherOffer.id } });
    expect(supersededOffer.status).toBe('EXPIRED');
  });

  it("un livreur ne peut PAS accepter une offre destinée à un autre livreur", async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id });
    const { user: intruderUser } = await createDriver();

    const offer = await createOffer(order.id, driver.id);

    await expect(acceptOffer(offer.id, { actorId: intruderUser.id, actorRole: 'DRIVER' })).rejects.toThrow(OfferError);
  });

  it('rejette une offre déjà expirée', async () => {
    const { order, zone } = await createReadyOrder();
    const { user: driverUser, driver } = await createDriver({ zoneId: zone.id });
    const offer = await createOffer(order.id, driver.id);

    // Simule le passage du temps au-delà du TTL sans dépendre d'un timer réel.
    await prisma.driverOffer.update({ where: { id: offer.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await expect(acceptOffer(offer.id, { actorId: driverUser.id, actorRole: 'DRIVER' })).rejects.toThrow(OfferError);

    const expired = await prisma.driverOffer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(expired.status).toBe('EXPIRED'); // matérialisée en base, pas juste refusée en mémoire
  });
});

describe('rejectOffer', () => {
  it('marque REJECTED sans toucher au statut du livreur ni de la commande', async () => {
    const { order, zone } = await createReadyOrder();
    const { user: driverUser, driver } = await createDriver({ zoneId: zone.id });
    const offer = await createOffer(order.id, driver.id);

    await rejectOffer(offer.id, { actorId: driverUser.id, actorRole: 'DRIVER' });

    const rejected = await prisma.driverOffer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(rejected.status).toBe('REJECTED');

    const stillAvailableDriver = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    const stillReadyOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stillAvailableDriver.status).toBe('AVAILABLE');
    expect(stillReadyOrder.status).toBe('READY_FOR_PICKUP');
  });
});

describe('offerToNextBestDriver — fallback en cascade', () => {
  it('ne resollicite jamais un livreur qui a déjà refusé', async () => {
    const { order, zone } = await createReadyOrder();
    const { user: firstUser, driver: first } = await createDriver({ zoneId: zone.id, lat: 33.5731, lng: -7.5898 });
    const { driver: second } = await createDriver({ zoneId: zone.id, lat: 33.62, lng: -7.65 });

    const firstOffer = await offerToNextBestDriver(order.id);
    expect(firstOffer.driverId).toBe(first.id); // le plus proche est sollicité en premier

    await rejectOffer(firstOffer.id, { actorId: firstUser.id, actorRole: 'DRIVER' });

    const secondOffer = await offerToNextBestDriver(order.id);
    expect(secondOffer.driverId).toBe(second.id);
    expect(secondOffer.driverId).not.toBe(first.id);
  });

  it('échoue explicitement quand tous les candidats ont refusé', async () => {
    const { order, zone } = await createReadyOrder();
    const { user: onlyUser, driver: only } = await createDriver({ zoneId: zone.id });

    const offer = await offerToNextBestDriver(order.id);
    expect(offer.driverId).toBe(only.id);
    await rejectOffer(offer.id, { actorId: onlyUser.id, actorRole: 'DRIVER' });

    await expect(offerToNextBestDriver(order.id)).rejects.toThrow(OfferError);
  });
});

it("OFFER_TTL_SECONDS est raisonnable (entre 30s et 5min — ni trop court pour répondre, ni trop long pour l'expérience client)", () => {
  expect(OFFER_TTL_SECONDS).toBeGreaterThanOrEqual(30);
  expect(OFFER_TTL_SECONDS).toBeLessThanOrEqual(300);
});

describe('createOffer — conformité documentaire', () => {
  it('refuse de proposer une mission à un livreur non conforme, même choisi explicitement', async () => {
    const { order, zone } = await createReadyOrder();
    const { driver } = await createDriver({ zoneId: zone.id, withDocuments: false });

    await expect(createOffer(order.id, driver.id)).rejects.toThrow(OfferError);
  });

  it('offerToNextBestDriver saute automatiquement un candidat non conforme au profit du suivant', async () => {
    const { order, zone } = await createReadyOrder();
    await createDriver({ zoneId: zone.id, withDocuments: false, lat: 33.5731, lng: -7.5898 }); // le plus proche, mais non conforme
    const { driver: compliant } = await createDriver({ zoneId: zone.id, lat: 33.62, lng: -7.65 });

    const offer = await offerToNextBestDriver(order.id);
    expect(offer.driverId).toBe(compliant.id);
  });
});
