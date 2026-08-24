import { prisma } from '@/infrastructure/database/client';

export class CustomerError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 404) {
    super(message);
    this.name = 'CustomerError';
    this.statusCode = statusCode;
  }
}

/**
 * CRM léger — pas de module de segmentation/marketing, seulement ce qu'un
 * opérateur support ou logistique a besoin de savoir "qui est ce client" :
 * coordonnées, adresses connues, historique de commandes. Recherche par nom
 * ou téléphone, la clé d'identité principale du marché marocain (voir
 * auth.validators.ts).
 */
export async function listCustomers(search?: string) {
  return prisma.customer.findMany({
    where: search
      ? { OR: [{ fullName: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] }
      : undefined,
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function getCustomerDetail(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      addresses: { orderBy: { isDefault: 'desc' } },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          supplier: { select: { companyName: true } },
        },
      },
    },
  });

  if (!customer) {
    throw new CustomerError('Client introuvable.');
  }

  // Comptés séparément plutôt que dérivés de `orders` (limité aux 30 plus
  // récentes pour l'affichage) — sinon un client avec plus de 30 commandes
  // afficherait un total tronqué et trompeur.
  const [totalOrders, deliveredAgg] = await Promise.all([
    prisma.order.count({ where: { customerId } }),
    prisma.order.aggregate({ where: { customerId, status: 'DELIVERED' }, _sum: { totalAmount: true }, _count: true }),
  ]);

  return {
    ...customer,
    stats: {
      totalOrders,
      deliveredOrders: deliveredAgg._count,
      totalSpent: Number(deliveredAgg._sum.totalAmount ?? 0),
    },
  };
}
