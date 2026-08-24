import { prisma } from '@/infrastructure/database/client';
import { nextTransactionReferences } from '@/modules/payments/transaction-reference';
import type { SettlementStatus } from '@prisma/client';

export class SettlementError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'SettlementError';
    this.statusCode = statusCode;
  }
}

/**
 * Génère un versement pour un fournisseur en agrégeant toutes ses commandes
 * livrées et payées sur la période, qui n'ont pas déjà été incluses dans un
 * versement précédent. L'appartenance à un versement se vérifie via
 * l'absence de transaction SUPPLIER_PAYOUT liée à la commande — pas besoin
 * d'un champ settlementId dédié sur Order.
 */
export async function generateSettlement(supplierId: string, periodStart: Date, periodEnd: Date) {
  const settleableOrders = await prisma.order.findMany({
    where: {
      supplierId,
      status: 'DELIVERED',
      paymentStatus: 'CONFIRMED',
      createdAt: { gte: periodStart, lte: periodEnd },
      transactions: { none: { type: 'SUPPLIER_PAYOUT' } },
    },
  });

  if (settleableOrders.length === 0) {
    throw new SettlementError('Aucune commande éligible pour cette période.', 404);
  }

  const grossAmount = settleableOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const totalCommission = settleableOrders.reduce((sum, order) => sum + Number(order.commissionAmount), 0);
  const netPayout = settleableOrders.reduce((sum, order) => sum + Number(order.supplierPayoutAmount), 0);

  return prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.create({
      data: {
        supplierId,
        periodStart,
        periodEnd,
        totalOrders: settleableOrders.length,
        grossAmount,
        totalCommission,
        netPayout,
        status: 'DRAFT',
      },
    });

    const references = await nextTransactionReferences(tx, settleableOrders.length);

    await tx.transaction.createMany({
      data: settleableOrders.map((order, index) => ({
        reference: references[index]!,
        orderId: order.id,
        settlementId: settlement.id,
        type: 'SUPPLIER_PAYOUT' as const,
        amount: order.supplierPayoutAmount,
        status: 'PENDING' as const,
      })),
    });

    return settlement;
  });
}

const SETTLEMENT_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  DRAFT: ['PENDING_PAYMENT', 'DISPUTED'],
  PENDING_PAYMENT: ['PAID', 'DISPUTED'],
  PAID: [],
  DISPUTED: ['PENDING_PAYMENT'],
};

async function assertSettlementTransition(settlementId: string, toStatus: SettlementStatus) {
  const settlement = await prisma.settlement.findUniqueOrThrow({ where: { id: settlementId } });
  if (!SETTLEMENT_TRANSITIONS[settlement.status].includes(toStatus)) {
    throw new SettlementError(`Transition invalide : "${settlement.status}" → "${toStatus}".`, 409);
  }
  return settlement;
}

export async function submitSettlementForPayment(settlementId: string) {
  await assertSettlementTransition(settlementId, 'PENDING_PAYMENT');
  return prisma.settlement.update({ where: { id: settlementId }, data: { status: 'PENDING_PAYMENT' } });
}

/**
 * Confirme le paiement effectif du versement au fournisseur et fait passer
 * toutes ses transactions SUPPLIER_PAYOUT de PENDING à CONFIRMED.
 */
export async function confirmSettlementPaid(settlementId: string) {
  await assertSettlementTransition(settlementId, 'PAID');
  return prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.update({
      where: { id: settlementId },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await tx.transaction.updateMany({
      where: { settlementId, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
    return settlement;
  });
}

export async function disputeSettlement(settlementId: string) {
  await assertSettlementTransition(settlementId, 'DISPUTED');
  return prisma.settlement.update({ where: { id: settlementId }, data: { status: 'DISPUTED' } });
}

export async function listSettlements(filter: { supplierId?: string; status?: SettlementStatus } = {}) {
  return prisma.settlement.findMany({
    where: { supplierId: filter.supplierId, status: filter.status },
    include: { supplier: { select: { companyName: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSettlementDetail(settlementId: string) {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: {
      supplier: { select: { companyName: true, taxId: true, billingAddress: true } },
      transactions: {
        orderBy: { createdAt: 'asc' },
        // Une seule transaction SUPPLIER_PAYOUT par commande couverte (voir
        // generateSettlement) : ce include suffit à reconstituer le détail
        // par commande de l'état de versement, sans requête séparée.
        include: {
          order: {
            select: { orderNumber: true, createdAt: true, totalAmount: true, commissionAmount: true, customer: { select: { fullName: true } } },
          },
        },
      },
    },
  });

  if (!settlement) {
    throw new SettlementError('Versement introuvable.', 404);
  }

  return settlement;
}
