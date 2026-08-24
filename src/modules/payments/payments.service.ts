import { prisma } from '@/infrastructure/database/client';
import { nextTransactionReferences } from './transaction-reference';

export class PaymentError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'PaymentError';
    this.statusCode = statusCode;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Traite l'encaissement à la livraison (Cash on Delivery) : crée le paiement
 * confirmé, les trois mouvements de ledger associés (collecte, commission
 * plateforme, rémunération livreur), et met à jour le solde du livreur.
 *
 * Idempotent : si un paiement COD existe déjà pour cette commande (l'event
 * ORDER_DELIVERED peut en théorie être rejoué), aucun double mouvement n'est créé.
 */
export async function processCodCollection(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { delivery: true } });

  if (order.paymentMethod !== 'CASH_ON_DELIVERY') {
    return null;
  }
  if (!order.delivery?.driverId) {
    throw new PaymentError('Impossible de traiter le COD : aucun livreur assigné à cette commande.');
  }

  const existingPayment = await prisma.payment.findFirst({ where: { orderId, method: 'CASH_ON_DELIVERY' } });
  if (existingPayment) {
    return existingPayment;
  }

  const driver = await prisma.driver.findUniqueOrThrow({ where: { id: order.delivery.driverId } });
  const totalAmount = Number(order.totalAmount);
  // La rémunération du livreur est calculée sur les frais de livraison (pas sur le
  // prix produit) : c'est la part qui lui revient réellement pour la course.
  const driverEarning = round2(Number(order.deliveryFee) * (Number(driver.commissionRate) / 100));
  const amountOwedToCompany = round2(totalAmount - driverEarning);

  return prisma.$transaction(async (tx) => {
    const [collectionRef, commissionRef, payoutRef] = await nextTransactionReferences(tx, 3);

    const payment = await tx.payment.create({
      data: {
        orderId,
        method: 'CASH_ON_DELIVERY',
        amount: totalAmount,
        status: 'CONFIRMED',
        collectedById: driver.id,
        confirmedAt: new Date(),
      },
    });

    await tx.transaction.create({
      data: {
        reference: collectionRef!,
        orderId,
        driverId: driver.id,
        type: 'COD_COLLECTION',
        amount: totalAmount,
        status: 'CONFIRMED',
      },
    });

    await tx.transaction.create({
      data: {
        reference: commissionRef!,
        orderId,
        type: 'COMMISSION_DEDUCTION',
        amount: order.commissionAmount,
        status: 'CONFIRMED',
      },
    });

    await tx.transaction.create({
      data: {
        reference: payoutRef!,
        orderId,
        driverId: driver.id,
        type: 'DRIVER_PAYOUT',
        amount: driverEarning,
        status: 'PENDING', // versé au livreur séparément — pas nettable sur le cash qu'il détient
      },
    });

    await tx.driver.update({
      where: { id: driver.id },
      data: { walletBalance: { increment: amountOwedToCompany } },
    });

    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'CONFIRMED' } });

    return payment;
  });
}

// Part des frais de livraison versée au livreur pour un déplacement effectué
// mais non payé (client absent, adresse erronée, refus) — inspiré du
// traitement des "no-show"/tentatives échouées chez Uber/DoorDash : une
// indemnité partielle, pas le tarif plein d'une livraison réussie.
const FAILED_ATTEMPT_COMPENSATION_RATIO = 0.5;

/**
 * Indemnise le livreur quand une commande est définitivement retournée après
 * un échec de livraison non imputable au livreur (voir FAILURE_STATUSES,
 * order-state-machine.ts) — une course blanche ne doit pas rester impayée.
 * Idempotent comme processCodCollection : un rejeu de l'événement RETURNED
 * ne double pas l'indemnité (une seule DRIVER_PAYOUT par commande, ce que
 * garantit déjà l'exclusivité DELIVERED/RETURNED de la state machine).
 */
export async function compensateDriverForFailedAttempt(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { delivery: true } });
  const driverId = order.delivery?.driverId;
  if (!driverId) {
    return null; // pas de livreur assigné, rien à indemniser
  }

  const existing = await prisma.transaction.findFirst({ where: { orderId, driverId, type: 'DRIVER_PAYOUT' } });
  if (existing) {
    return existing;
  }

  const compensation = round2(Number(order.deliveryFee) * FAILED_ATTEMPT_COMPENSATION_RATIO);
  if (compensation <= 0) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const [reference] = await nextTransactionReferences(tx, 1);
    const transaction = await tx.transaction.create({
      data: {
        reference: reference!,
        orderId,
        driverId,
        type: 'DRIVER_PAYOUT',
        amount: compensation,
        status: 'PENDING',
      },
    });
    await tx.driver.update({ where: { id: driverId }, data: { walletBalance: { increment: compensation } } });
    return transaction;
  });
}

/**
 * Confirmation manuelle d'un paiement non-COD (prépayé en ligne ou virement),
 * déclenchée par la finance après réconciliation externe (gateway, relevé bancaire).
 */
export async function confirmManualPayment(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  if (order.paymentMethod === 'CASH_ON_DELIVERY') {
    throw new PaymentError('Les commandes COD sont confirmées automatiquement à la livraison.');
  }

  const existingPayment = await prisma.payment.findFirst({ where: { orderId, method: order.paymentMethod } });
  if (existingPayment?.status === 'CONFIRMED') {
    return existingPayment;
  }

  return prisma.$transaction(async (tx) => {
    const [commissionRef] = await nextTransactionReferences(tx, 1);

    const payment = existingPayment
      ? await tx.payment.update({
          where: { id: existingPayment.id },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        })
      : await tx.payment.create({
          data: {
            orderId,
            method: order.paymentMethod,
            amount: order.totalAmount,
            status: 'CONFIRMED',
            confirmedAt: new Date(),
          },
        });

    await tx.transaction.create({
      data: {
        reference: commissionRef!,
        orderId,
        type: 'COMMISSION_DEDUCTION',
        amount: order.commissionAmount,
        status: 'CONFIRMED',
      },
    });

    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'CONFIRMED' } });

    return payment;
  });
}

export async function listOrderTransactions(orderId: string) {
  return prisma.transaction.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface DriverEarningsSummary {
  walletBalance: number;
  payoutToday: number;
  payoutThisWeek: number;
  payoutThisMonth: number;
  deliveredToday: number;
}

/**
 * Vue "Mes gains" côté livreur — inspirée des apps Uber/Glovo, où c'est
 * l'écran le plus consulté. `walletBalance` est le solde réel dû au livreur
 * (déjà tenu à jour ailleurs, voir processCodCollection) ; les totaux
 * période ne sont qu'une lecture agrégée du ledger, purement informative.
 */
export async function getDriverEarningsSummary(driverId: string): Promise<DriverEarningsSummary> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = new Date(todayStart.getTime() - todayStart.getDay() * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [driver, payoutToday, payoutThisWeek, payoutThisMonth, deliveredToday] = await Promise.all([
    prisma.driver.findUniqueOrThrow({ where: { id: driverId }, select: { walletBalance: true } }),
    prisma.transaction.aggregate({
      where: { driverId, type: 'DRIVER_PAYOUT', createdAt: { gte: todayStart } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { driverId, type: 'DRIVER_PAYOUT', createdAt: { gte: weekStart } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { driverId, type: 'DRIVER_PAYOUT', createdAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.delivery.count({ where: { driverId, deliveredAt: { gte: todayStart } } }),
  ]);

  return {
    walletBalance: Number(driver.walletBalance),
    payoutToday: round2(Number(payoutToday._sum.amount ?? 0)),
    payoutThisWeek: round2(Number(payoutThisWeek._sum.amount ?? 0)),
    payoutThisMonth: round2(Number(payoutThisMonth._sum.amount ?? 0)),
    deliveredToday,
  };
}

/**
 * Historique des mouvements affectant le livreur (rémunérations, éventuels
 * ajustements/remboursements) — le plus récent d'abord, avec le numéro de
 * commande associé quand il existe.
 */
export async function listDriverTransactions(driverId: string, limit = 50) {
  return prisma.transaction.findMany({
    where: { driverId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { order: { select: { orderNumber: true } } },
  });
}
