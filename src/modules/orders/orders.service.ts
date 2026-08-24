import { prisma } from '@/infrastructure/database/client';
import type { OrderStatus } from '@prisma/client';
import {
  assertValidTransition,
  getDomainEventsForTransition,
} from './order-state-machine';
import { dispatchDomainEvent } from '@/infrastructure/messaging/event-bus';
import { getIneligibleOwnerIds } from '@/modules/documents/documents.service';
import { validateAndApplyDiscount } from '@/modules/promotions/promotions.service';

export class OrderError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'OrderError';
    this.statusCode = statusCode;
  }
}

/**
 * Génère un numéro de commande lisible et unique : ORD-2026-000184
 * Le compteur séquentiel est calculé par année pour rester lisible sur le long terme.
 */
export async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const countThisYear = await prisma.order.count({
    where: { createdAt: { gte: new Date(`${year}-01-01T00:00:00.000Z`) } },
  });
  const sequence = String(countThisYear + 1).padStart(6, '0');
  return `ORD-${year}-${sequence}`;
}

interface CreateOrderInput {
  supplierId: string;
  customerId: string;
  addressId: string;
  items: { productId: string; quantity: number; unitPrice: number }[];
  deliveryFee: number;
  instructions?: string;
  promoCode?: string;
  scheduledFor?: Date;
  scheduledWindowMinutes?: number;
}

export async function createOrder(input: CreateOrderInput) {
  const orderNumber = await generateOrderNumber();
  const subtotal = input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  // Le code promo s'applique sur le sous-total (hors frais de livraison) —
  // validé et son usage décompté ici, juste avant la création réelle de la
  // commande (voir promotions.service.ts pour la limite acceptée : usage
  // compté même si la création échouait juste après, pas de saga complète).
  const discount = input.promoCode ? await validateAndApplyDiscount(input.promoCode, subtotal) : null;
  const discountAmount = discount?.discountAmount ?? 0;
  const total = round2(subtotal + input.deliveryFee - discountAmount);

  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: input.supplierId } });
  const commission = round2(total * (Number(supplier.defaultCommissionRate) / 100));
  const supplierPayout = round2(total - commission);

  const order = await prisma.order.create({
    data: {
      orderNumber,
      supplierId: input.supplierId,
      customerId: input.customerId,
      addressId: input.addressId,
      subtotalAmount: subtotal,
      deliveryFee: input.deliveryFee,
      totalAmount: total,
      commissionAmount: commission,
      supplierPayoutAmount: supplierPayout,
      instructions: input.instructions,
      status: 'PENDING',
      promoCodeId: discount?.promoCodeId,
      discountAmount,
      scheduledFor: input.scheduledFor,
      scheduledWindowMinutes: input.scheduledWindowMinutes,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: round2(item.unitPrice * item.quantity),
        })),
      },
      statusHistory: {
        create: { toStatus: 'PENDING', reason: 'Commande créée' },
      },
    },
    include: { items: true },
  });

  return order;
}

/**
 * Point d'entrée UNIQUE pour changer le statut d'une commande.
 * Garantit : validation de la transition, historique, et déclenchement
 * des effets métier en aval (notifications, finance, analytics) via l'event bus.
 */
export async function transitionOrderStatus(
  orderId: string,
  toStatus: OrderStatus,
  context: { actorId?: string; reason?: string }
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

    assertValidTransition(order.status, toStatus);

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: toStatus },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus,
        changedById: context.actorId,
        reason: context.reason,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: context.actorId,
        action: 'ORDER_STATUS_CHANGED',
        entityType: 'Order',
        entityId: orderId,
        beforeState: { status: order.status },
        afterState: { status: toStatus },
      },
    });

    return updated;
  }).then(async (updated) => {
    // Les événements domaine sont émis APRÈS le commit transactionnel :
    // aucun effet de bord externe (notif, paiement) ne doit dépendre d'une
    // transaction qui pourrait encore être annulée.
    for (const eventName of getDomainEventsForTransition(toStatus)) {
      await dispatchDomainEvent(eventName, { orderId: updated.id, order: updated });
    }
    return updated;
  });
}

interface CreateOrderForSupplierInput {
  supplierId: string;
  customer: { fullName: string; phone: string; email?: string };
  address: {
    label?: string;
    fullAddress: string;
    city: string;
    zoneId?: string;
    latitude?: number;
    longitude?: number;
  };
  items: { productId: string; quantity: number }[];
  deliveryFee: number;
  instructions?: string;
  promoCode?: string;
  scheduledFor?: Date;
  scheduledWindowMinutes?: number;
}

/**
 * Point d'entrée fournisseur (section 14 du plan) : saisit client + adresse +
 * produits directement, sans devoir connaître un customerId/addressId au
 * préalable. Le client est retrouvé par téléphone ou créé s'il est nouveau.
 * Le prix unitaire est TOUJOURS relu depuis le catalogue fournisseur — jamais
 * fait confiance à un prix transmis par l'appelant.
 */
export async function createOrderForSupplier(input: CreateOrderForSupplierInput) {
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: input.supplierId } });
  if (supplier.status !== 'ACTIVE') {
    throw new OrderError(
      `Compte fournisseur au statut "${supplier.status}" : impossible de créer une commande avant approbation.`,
      403
    );
  }

  // Même principe que côté livreur (voir dispatch.service.ts) : le statut
  // ACTIVE autorise le compte, la conformité documentaire autorise la
  // transaction. Les deux sont vérifiés indépendamment.
  const ineligibleIds = await getIneligibleOwnerIds('SUPPLIER', [input.supplierId]);
  if (ineligibleIds.has(input.supplierId)) {
    throw new OrderError('Documents fournisseur manquants ou expirés : impossible de créer une commande.', 403);
  }

  const products = await prisma.product.findMany({
    where: { id: { in: input.items.map((item) => item.productId) }, supplierId: input.supplierId, isActive: true },
  });

  if (products.length !== new Set(input.items.map((item) => item.productId)).size) {
    throw new OrderError("Un ou plusieurs produits sont invalides, inactifs, ou n'appartiennent pas à ce fournisseur.", 422);
  }

  const priceByProductId = new Map(products.map((product) => [product.id, Number(product.price)]));

  let customer = await prisma.customer.findFirst({ where: { phone: input.customer.phone } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { fullName: input.customer.fullName, phone: input.customer.phone, email: input.customer.email },
    });
  }

  const address = await prisma.address.create({
    data: {
      customerId: customer.id,
      label: input.address.label,
      fullAddress: input.address.fullAddress,
      city: input.address.city,
      zoneId: input.address.zoneId,
      latitude: input.address.latitude,
      longitude: input.address.longitude,
    },
  });

  return createOrder({
    supplierId: input.supplierId,
    customerId: customer.id,
    addressId: address.id,
    items: input.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: priceByProductId.get(item.productId)!,
    })),
    deliveryFee: input.deliveryFee,
    instructions: input.instructions,
    promoCode: input.promoCode,
    scheduledFor: input.scheduledFor,
    scheduledWindowMinutes: input.scheduledWindowMinutes,
  });
}

export async function listOrders(filter: { supplierId?: string; status?: OrderStatus } = {}) {
  return prisma.order.findMany({
    where: { supplierId: filter.supplierId, status: filter.status },
    include: { customer: true, address: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function getOrderDetail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      address: true,
      items: { include: { product: true } },
      statusHistory: { orderBy: { createdAt: 'asc' } },
      delivery: true,
      payments: true,
      promoCode: { select: { code: true } },
      supplier: { select: { companyName: true, contactPhone: true, taxId: true, billingAddress: true } },
    },
  });

  if (!order) {
    throw new OrderError('Commande introuvable.', 404);
  }

  return order;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
