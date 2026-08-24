import { customAlphabet } from 'nanoid';
import { prisma } from '@/infrastructure/database/client';
import { nextTransactionReferences } from '@/modules/payments/transaction-reference';
import { queueAndSendNotification } from '@/modules/notifications/notifications.service';

export class ReferralError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ReferralError';
    this.statusCode = statusCode;
  }
}

// Alphabet sans caractères ambigus à l'oral/à l'écrit (pas de 0/O, 1/I) — un
// code de parrainage se dicte et se recopie à la main, contrairement à un id
// technique.
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateCode = customAlphabet(REFERRAL_CODE_ALPHABET, 7);

// Nombre de livraisons réussies que le livreur parrainé doit atteindre pour
// déclencher la prime — inspiré du seuil "après N courses" d'Uber/Grab :
// assez élevé pour prouver une activité réelle (pas un compte créé puis
// abandonné après une course), assez bas pour rester atteignable en
// quelques semaines.
export const DRIVER_REFERRAL_MILESTONE = 15;
export const REFERRER_BONUS_AMOUNT = 300;
export const REFEREE_BONUS_AMOUNT = 150;

/**
 * Attribue un code de parrainage personnel au livreur — appelé une seule
 * fois, à l'inscription (voir auth.service.ts). Boucle de nouvelle tentative
 * en cas de collision : improbable (33^7 combinaisons) mais moins coûteux
 * qu'une contrainte d'unicité qui ferait échouer l'inscription entière.
 */
export async function assignReferralCode(driverId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      await prisma.driver.update({ where: { id: driverId }, data: { referralCode: code } });
      return code;
    } catch (err) {
      const isUniqueViolation = (err as { code?: string }).code === 'P2002';
      if (!isUniqueViolation) throw err;
    }
  }
  throw new ReferralError('Impossible de générer un code de parrainage unique.', 500);
}

/**
 * Rattache un livreur nouvellement inscrit au parrain propriétaire du code
 * fourni. Un code invalide, inconnu, ou appartenant au livreur lui-même
 * n'empêche jamais l'inscription — il est simplement ignoré (même choix que
 * les codes promo mal saisis à la commande : ne jamais bloquer un utilisateur
 * sur un champ secondaire).
 */
export async function linkReferral(newDriverId: string, referralCodeInput: string): Promise<void> {
  const code = referralCodeInput.trim().toUpperCase();
  if (!code) return;

  const referrer = await prisma.driver.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (!referrer || referrer.id === newDriverId) return;

  await prisma.driver.update({ where: { id: newDriverId }, data: { referredById: referrer.id } });
}

/**
 * Déclenchée à chaque livraison réussie (événement ORDER_DELIVERED — voir
 * referrals.events.ts). Verrouille sur `referralRewardedAt` : dès que la
 * prime est versée une fois, tout rejeu de l'événement ressort immédiatement
 * sans rien recréer (même discipline d'idempotence que
 * compensateDriverForFailedAttempt, payments.service.ts).
 */
export async function processDriverReferralMilestone(driverId: string, orderId: string) {
  const referee = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { id: true, referredById: true, referralRewardedAt: true, user: { select: { firstName: true, lastName: true } } },
  });
  if (!referee?.referredById || referee.referralRewardedAt) {
    return null;
  }

  const successfulDeliveries = await prisma.delivery.count({ where: { driverId, deliveredAt: { not: null } } });
  if (successfulDeliveries < DRIVER_REFERRAL_MILESTONE) {
    return null;
  }

  const referrer = await prisma.driver.findUniqueOrThrow({
    where: { id: referee.referredById },
    select: { id: true, userId: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    const [referrerRef, refereeRef] = await nextTransactionReferences(tx, 2);

    await tx.transaction.create({
      data: {
        reference: referrerRef!,
        orderId,
        driverId: referrer.id,
        type: 'REFERRAL_BONUS',
        amount: REFERRER_BONUS_AMOUNT,
        status: 'PENDING',
      },
    });
    await tx.transaction.create({
      data: {
        reference: refereeRef!,
        orderId,
        driverId: referee.id,
        type: 'REFERRAL_BONUS',
        amount: REFEREE_BONUS_AMOUNT,
        status: 'PENDING',
      },
    });

    await tx.driver.update({ where: { id: referrer.id }, data: { walletBalance: { increment: REFERRER_BONUS_AMOUNT } } });
    await tx.driver.update({
      where: { id: referee.id },
      data: { walletBalance: { increment: REFEREE_BONUS_AMOUNT }, referralRewardedAt: new Date() },
    });

    return { referrerBonus: REFERRER_BONUS_AMOUNT, refereeBonus: REFEREE_BONUS_AMOUNT };
  });

  const refereeName = `${referee.user.firstName} ${referee.user.lastName}`;
  await queueAndSendNotification({
    recipient: { userId: referrer.userId },
    channel: 'PUSH',
    event: 'REFERRAL_BONUS_EARNED',
    payload: { amount: REFERRER_BONUS_AMOUNT, refereeName },
  }).catch(() => null);

  return result;
}

export interface DriverReferralOverview {
  referralCode: string | null;
  milestone: number;
  referrerBonus: number;
  refereeBonus: number;
  referredBy: { driverCode: string; fullName: string } | null;
  referrals: Array<{
    driverId: string;
    fullName: string;
    driverCode: string;
    successfulDeliveries: number;
    rewarded: boolean;
    joinedAt: Date;
  }>;
}

/**
 * Vue "Parrainage" côté livreur (voir /(driver)/referrals). `successfulDeliveries`
 * est recalculé par filleul plutôt que lu d'un compteur dénormalisé — cohérent
 * avec getDriverPerformance (drivers.service.ts), qui fait le même choix.
 */
export async function getDriverReferralOverview(driverId: string): Promise<DriverReferralOverview> {
  const driver = await prisma.driver.findUniqueOrThrow({
    where: { id: driverId },
    select: {
      referralCode: true,
      referredBy: { select: { driverCode: true, user: { select: { firstName: true, lastName: true } } } },
      referrals: {
        select: {
          id: true,
          driverCode: true,
          referralRewardedAt: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  const deliveryCounts = await prisma.delivery.groupBy({
    by: ['driverId'],
    where: { driverId: { in: driver.referrals.map((r) => r.id) }, deliveredAt: { not: null } },
    _count: true,
  });
  const countByDriverId = new Map(deliveryCounts.map((d) => [d.driverId, d._count]));

  return {
    referralCode: driver.referralCode,
    milestone: DRIVER_REFERRAL_MILESTONE,
    referrerBonus: REFERRER_BONUS_AMOUNT,
    refereeBonus: REFEREE_BONUS_AMOUNT,
    referredBy: driver.referredBy
      ? { driverCode: driver.referredBy.driverCode, fullName: `${driver.referredBy.user.firstName} ${driver.referredBy.user.lastName}` }
      : null,
    referrals: driver.referrals.map((r) => ({
      driverId: r.id,
      fullName: `${r.user.firstName} ${r.user.lastName}`,
      driverCode: r.driverCode,
      successfulDeliveries: countByDriverId.get(r.id) ?? 0,
      rewarded: r.referralRewardedAt !== null,
      joinedAt: r.createdAt,
    })),
  };
}
