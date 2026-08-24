import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { prisma, resetDatabase } from '../db';
import { createDriver, createOrderFixtures } from '../factories';
import { createOrderForSupplier } from '@/modules/orders/orders.service';
import { register } from '@/modules/auth/auth.service';
import { registerAllEventHandlers } from '../register-events';
import {
  assignReferralCode,
  linkReferral,
  processDriverReferralMilestone,
  getDriverReferralOverview,
  DRIVER_REFERRAL_MILESTONE,
  REFERRER_BONUS_AMOUNT,
  REFEREE_BONUS_AMOUNT,
} from '@/modules/drivers/referrals.service';
import { dispatchDomainEvent } from '@/infrastructure/messaging/event-bus';

beforeAll(registerAllEventHandlers);
beforeEach(resetDatabase);

let phoneCounter = 0;
function uniquePhone(): string {
  phoneCounter += 1;
  return `+2126${String(80000000 + phoneCounter)}`;
}

/**
 * Crée `n` commandes livrées (bypass dispatch/state machine — hors sujet
 * ici) pour un livreur donné, afin de simuler des livraisons réussies pour
 * le seuil de parrainage.
 */
async function createSuccessfulDeliveries(driverId: string, n: number): Promise<void> {
  const { supplier, product, address } = await createOrderFixtures();
  for (let i = 0; i < n; i += 1) {
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: `Client Referral ${i}`, phone: uniquePhone() },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 15,
    });
    await prisma.delivery.create({ data: { orderId: order.id, driverId, deliveredAt: new Date() } });
  }
}

describe('assignReferralCode / linkReferral', () => {
  it('attribue un code unique au livreur', async () => {
    const { driver } = await createDriver();
    const code = await assignReferralCode(driver.id);

    const updated = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(updated.referralCode).toBe(code);
    expect(code).toHaveLength(7);
  });

  it('rattache le filleul au parrain quand le code est valide', async () => {
    const { driver: referrer } = await createDriver();
    const code = await assignReferralCode(referrer.id);
    const { driver: referee } = await createDriver();

    await linkReferral(referee.id, code);

    const updated = await prisma.driver.findUniqueOrThrow({ where: { id: referee.id } });
    expect(updated.referredById).toBe(referrer.id);
  });

  it("ignore silencieusement un code de parrainage inconnu, sans lever d'erreur", async () => {
    const { driver: referee } = await createDriver();
    await expect(linkReferral(referee.id, 'INCONNU')).resolves.toBeUndefined();

    const updated = await prisma.driver.findUniqueOrThrow({ where: { id: referee.id } });
    expect(updated.referredById).toBeNull();
  });

  it('ignore un livreur qui tenterait de se parrainer lui-même', async () => {
    const { driver } = await createDriver();
    const code = await assignReferralCode(driver.id);

    await linkReferral(driver.id, code);

    const updated = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(updated.referredById).toBeNull();
  });
});

describe('register — parrainage à l\'inscription', () => {
  it('un nouveau livreur reçoit son propre code et se rattache au parrain fourni', async () => {
    const { driver: referrer } = await createDriver();
    const referrerCode = await assignReferralCode(referrer.id);
    const zone = await prisma.zone.create({ data: { name: `Zone-${Date.now()}`, city: 'Casablanca' } });

    const { userId } = await register({
      firstName: 'Nouveau',
      lastName: 'Livreur',
      phone: uniquePhone(),
      password: 'Passw0rd!2026',
      role: 'DRIVER',
      vehicleType: 'MOTORCYCLE',
      address: '1 Rue Test, Casablanca',
      baseZoneId: zone.id,
      referralCode: referrerCode,
    });

    const newDriver = await prisma.driver.findUniqueOrThrow({ where: { userId } });
    expect(newDriver.referralCode).not.toBeNull();
    expect(newDriver.referredById).toBe(referrer.id);
  });
});

describe('processDriverReferralMilestone', () => {
  it("ne fait rien si le livreur n'a pas été parrainé", async () => {
    const { driver } = await createDriver();
    await createSuccessfulDeliveries(driver.id, DRIVER_REFERRAL_MILESTONE);

    const result = await processDriverReferralMilestone(driver.id, 'irrelevant-order-id');
    expect(result).toBeNull();

    const updated = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(updated.referralRewardedAt).toBeNull();
  });

  it("ne récompense pas avant d'avoir atteint le seuil de livraisons", async () => {
    const { driver: referrer } = await createDriver();
    const { driver: referee } = await createDriver();
    await prisma.driver.update({ where: { id: referee.id }, data: { referredById: referrer.id } });
    await createSuccessfulDeliveries(referee.id, DRIVER_REFERRAL_MILESTONE - 1);

    const result = await processDriverReferralMilestone(referee.id, 'irrelevant-order-id');
    expect(result).toBeNull();

    const updated = await prisma.driver.findUniqueOrThrow({ where: { id: referee.id } });
    expect(updated.referralRewardedAt).toBeNull();
  });

  it('verse la prime aux deux livreurs une fois le seuil atteint, une seule fois', async () => {
    const { driver: referrer } = await createDriver();
    const { driver: referee } = await createDriver();
    await prisma.driver.update({ where: { id: referee.id }, data: { referredById: referrer.id } });
    await createSuccessfulDeliveries(referee.id, DRIVER_REFERRAL_MILESTONE);

    const { supplier, product, address } = await createOrderFixtures();
    const qualifyingOrder = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Qualifiant', phone: uniquePhone() },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 15,
    });

    const result = await processDriverReferralMilestone(referee.id, qualifyingOrder.id);
    expect(result).toEqual({ referrerBonus: REFERRER_BONUS_AMOUNT, refereeBonus: REFEREE_BONUS_AMOUNT });

    const [referrerUpdated, refereeUpdated] = await Promise.all([
      prisma.driver.findUniqueOrThrow({ where: { id: referrer.id } }),
      prisma.driver.findUniqueOrThrow({ where: { id: referee.id } }),
    ]);
    expect(Number(referrerUpdated.walletBalance)).toBe(REFERRER_BONUS_AMOUNT);
    expect(Number(refereeUpdated.walletBalance)).toBe(REFEREE_BONUS_AMOUNT);
    expect(refereeUpdated.referralRewardedAt).not.toBeNull();

    const bonusTransactions = await prisma.transaction.findMany({ where: { type: 'REFERRAL_BONUS' } });
    expect(bonusTransactions).toHaveLength(2);

    // Rejouer l'événement (ex: event bus rejoué) ne verse rien de plus.
    const secondCall = await processDriverReferralMilestone(referee.id, qualifyingOrder.id);
    expect(secondCall).toBeNull();
    const stillTwo = await prisma.transaction.findMany({ where: { type: 'REFERRAL_BONUS' } });
    expect(stillTwo).toHaveLength(2);
  });

  it("se déclenche automatiquement via l'événement ORDER_DELIVERED de la state machine", async () => {
    const { driver: referrer } = await createDriver();
    const { driver: referee } = await createDriver();
    await prisma.driver.update({ where: { id: referee.id }, data: { referredById: referrer.id } });
    await createSuccessfulDeliveries(referee.id, DRIVER_REFERRAL_MILESTONE - 1);

    const { supplier, product, address } = await createOrderFixtures();
    const order = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client Event', phone: uniquePhone() },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 15,
    });
    await prisma.delivery.create({ data: { orderId: order.id, driverId: referee.id, deliveredAt: new Date() } });

    await dispatchDomainEvent('ORDER_DELIVERED', { orderId: order.id });

    const updated = await prisma.driver.findUniqueOrThrow({ where: { id: referee.id } });
    expect(updated.referralRewardedAt).not.toBeNull();
  });
});

describe('getDriverReferralOverview', () => {
  it('liste les filleuls avec leur progression et distingue ceux déjà récompensés', async () => {
    const { driver: referrer } = await createDriver();
    const code = await assignReferralCode(referrer.id);

    const { driver: refereeA } = await createDriver();
    await linkReferral(refereeA.id, code);
    await createSuccessfulDeliveries(refereeA.id, 3);

    const { driver: refereeB } = await createDriver();
    await linkReferral(refereeB.id, code);
    await createSuccessfulDeliveries(refereeB.id, DRIVER_REFERRAL_MILESTONE);
    const { supplier, product, address } = await createOrderFixtures();
    const qualifyingOrder = await createOrderForSupplier({
      supplierId: supplier.id,
      customer: { fullName: 'Client B', phone: uniquePhone() },
      address: { fullAddress: address.fullAddress, city: address.city, zoneId: address.zoneId ?? undefined },
      items: [{ productId: product.id, quantity: 1 }],
      deliveryFee: 15,
    });
    await processDriverReferralMilestone(refereeB.id, qualifyingOrder.id);

    const overview = await getDriverReferralOverview(referrer.id);
    expect(overview.referralCode).toBe(code);
    expect(overview.referrals).toHaveLength(2);

    const entryA = overview.referrals.find((r) => r.driverId === refereeA.id);
    const entryB = overview.referrals.find((r) => r.driverId === refereeB.id);
    expect(entryA?.successfulDeliveries).toBe(3);
    expect(entryA?.rewarded).toBe(false);
    expect(entryB?.rewarded).toBe(true);
  });

  it('indique qui a parrainé un livreur donné', async () => {
    const { driver: referrer } = await createDriver();
    const code = await assignReferralCode(referrer.id);
    const { driver: referee } = await createDriver();
    await linkReferral(referee.id, code);

    const overview = await getDriverReferralOverview(referee.id);
    expect(overview.referredBy?.driverCode).toBe(referrer.driverCode);
  });
});
