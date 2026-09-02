import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createOrderFixtures, createDriver, createUser } from '../factories';
import { createOrderForSupplier, transitionOrderStatus } from '@/modules/orders/orders.service';
import { assignDriverToOrder } from '@/modules/dispatch/dispatch.service';
import {
  advanceDeliveryStatus,
  recordDeliveryAttempt,
  getMyMissions,
  getDeliveryProofFile,
  DeliveryError,
} from '@/modules/deliveries/deliveries.service';

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
        proof: { type: 'OTP', value: '000000' },
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

describe('advanceDeliveryStatus — vérification QR à l\'enlèvement (PICKED_UP)', () => {
  it('accepte PICKED_UP sans code — le scan reste optionnel côté serveur', async () => {
    const { order, driverUser } = await createAssignedOrder();
    const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const };

    const result = await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);
    expect(result.status).toBe('PICKED_UP');
  });

  it('accepte PICKED_UP avec le bon code (LOGIFLOW:<numéro de commande>)', async () => {
    const { order, driverUser } = await createAssignedOrder();
    const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const, pickupCode: `LOGIFLOW:${order.orderNumber}` };

    const result = await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);
    expect(result.status).toBe('PICKED_UP');
  });

  it('refuse PICKED_UP si le code scanné ne correspond pas à cette commande', async () => {
    const { order, driverUser } = await createAssignedOrder();
    const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const, pickupCode: 'LOGIFLOW:ORD-2020-999999' };

    await expect(advanceDeliveryStatus(order.id, 'PICKED_UP', ctx)).rejects.toThrow(DeliveryError);

    const stillAssigned = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stillAssigned.status).toBe('ASSIGNED'); // aucune transition appliquée sur code invalide
  });

  it("refuse PICKED_UP pour un livreur non assigné (livreur B) même avec le BON code QR de la commande — l'ownership prime sur la vérification QR, jamais l'inverse", async () => {
    // Commande assignée au livreur A.
    const { order } = await createAssignedOrder();
    // Livreur B — aucun lien avec cette commande.
    const { user: intruderUser } = await createDriver();

    // Livreur B soumet le code QR correct (celui du bordereau réel de cette
    // commande) : la vérification de propriété doit rejeter avant même que
    // le code soit comparé, sinon un livreur qui intercepterait/photographierait
    // le bordereau d'une commande d'un collègue pourrait se l'approprier.
    const correctPickupCode = `LOGIFLOW:${order.orderNumber}`;
    await expect(
      advanceDeliveryStatus(order.id, 'PICKED_UP', {
        actorId: intruderUser.id,
        actorRole: 'DRIVER',
        pickupCode: correctPickupCode,
      })
    ).rejects.toThrow(DeliveryError);

    // Aucune transition n'a eu lieu : la commande reste ASSIGNED, pas PICKED_UP.
    const stillAssigned = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stillAssigned.status).toBe('ASSIGNED');
  });
});

describe('deliveries — preuve de livraison PHOTO/SIGNATURE (fichier réel)', () => {
  async function deliverWithFile(proofType: 'PHOTO' | 'SIGNATURE', bytes: Buffer) {
    const { order, driverUser } = await createAssignedOrder();
    const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', ctx);
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', ctx);
    await recordDeliveryAttempt(order.id, {
      ...ctx,
      result: 'SUCCESS',
      proof: { type: proofType, file: { buffer: bytes, mimeType: 'image/png' } },
    });
    return order;
  }

  it('stocke le fichier PHOTO via DocumentStorage et persiste une clé, jamais les octets en base', async () => {
    const bytes = Buffer.from('fake-photo-bytes');
    const order = await deliverWithFile('PHOTO', bytes);

    const delivery = await prisma.delivery.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(delivery.proofType).toBe('PHOTO');
    const proofData = delivery.proofData as { fileKey?: string; mimeType?: string };
    expect(proofData.fileKey).toMatch(/^deliveries\/.+\/PHOTO-.+\.png$/);
    expect(proofData.mimeType).toBe('image/png');
    // Le JSON ne contient que la clé de stockage, jamais les octets eux-mêmes.
    expect(JSON.stringify(proofData)).not.toContain('fake-photo-bytes');
  });

  it('getDeliveryProofFile relit exactement les octets stockés pour une preuve SIGNATURE', async () => {
    const bytes = Buffer.from('fake-signature-bytes');
    const order = await deliverWithFile('SIGNATURE', bytes);

    const { buffer, mimeType } = await getDeliveryProofFile(order.id);
    expect(buffer.equals(bytes)).toBe(true);
    expect(mimeType).toBe('image/png');
  });

  it('refuse une preuve PHOTO/SIGNATURE sans fichier joint', async () => {
    const { order, driverUser } = await createAssignedOrder();
    const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', ctx);
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', ctx);

    await expect(
      recordDeliveryAttempt(order.id, { ...ctx, result: 'SUCCESS', proof: { type: 'PHOTO' } })
    ).rejects.toThrow(DeliveryError);
  });

  it("getDeliveryProofFile lève une erreur explicite pour une preuve OTP (rien à streamer)", async () => {
    const { order, driverUser } = await createAssignedOrder();
    const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', ctx);
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', ctx);
    await recordDeliveryAttempt(order.id, { ...ctx, result: 'SUCCESS', proof: { type: 'OTP', value: '123456' } });

    await expect(getDeliveryProofFile(order.id)).rejects.toThrow(DeliveryError);
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

describe('getMyMissions — multi-arrêts', () => {
  it("ordonne les missions par plus proche voisin depuis la position du livreur, pas par ordre d'assignation", async () => {
    const { order: farOrder, driver, zone } = await createAssignedOrder();
    // Positionne la commande "lointaine" à ~10km, puis assigne une seconde
    // commande beaucoup plus proche de la position actuelle du livreur.
    await prisma.address.update({
      where: { id: farOrder.addressId },
      data: { latitude: 33.66, longitude: -7.5898 },
    });
    await prisma.driver.update({ where: { id: driver.id }, data: { currentLatitude: 33.5731, currentLongitude: -7.5898 } });

    const fixtures = await createOrderFixtures({ zoneId: zone.id });
    const nearOrder = await createOrderForSupplier({
      supplierId: fixtures.supplier.id,
      customer: { fullName: 'Client Proche', phone: '+212600100201' },
      address: { fullAddress: fixtures.address.fullAddress, city: fixtures.address.city, zoneId: zone.id, latitude: 33.5735, longitude: -7.5899 },
      items: [{ productId: fixtures.product.id, quantity: 1 }],
      deliveryFee: 20,
    });
    await transitionOrderStatus(nearOrder.id, 'CONFIRMED', {});
    await transitionOrderStatus(nearOrder.id, 'READY_FOR_PICKUP', {});
    await assignDriverToOrder(nearOrder.id, driver.id, {});

    const missions = await getMyMissions(driver.id);
    expect(missions).toHaveLength(2);
    expect(missions[0]?.orderId).toBe(nearOrder.id); // le plus proche en premier, même assigné en second
    expect(missions[1]?.orderId).toBe(farOrder.id);
  });

  it('ne retourne aucune commande dans un état terminal', async () => {
    const { order, driverUser, driver } = await createAssignedOrder();
    const ctx = { actorId: driverUser.id, actorRole: 'DRIVER' as const };
    await advanceDeliveryStatus(order.id, 'PICKED_UP', ctx);
    await advanceDeliveryStatus(order.id, 'IN_TRANSIT', ctx);
    await advanceDeliveryStatus(order.id, 'OUT_FOR_DELIVERY', ctx);
    await recordDeliveryAttempt(order.id, { ...ctx, result: 'SUCCESS', proof: { type: 'OTP', value: '000000' } });

    const missions = await getMyMissions(driver.id);
    expect(missions).toHaveLength(0);
  });
});
