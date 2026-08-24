import { prisma } from '@/infrastructure/database/client';
import type { OrderStatus } from '@prisma/client';

const IN_PROGRESS_STATUSES: OrderStatus[] = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'];
const PROBLEM_STATUSES: OrderStatus[] = ['CUSTOMER_ABSENT', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED'];

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface DashboardSummary {
  totalOrders: number;
  totalDelivered: number;
  totalRevenue: number;
  successRate: number;
  today: { delivered: number; inProgress: number; problems: number; returned: number };
  revenueGrowthPercent: number | null;
}

/**
 * Agrégats pour le dashboard admin (section 13 du plan produit) : volumes,
 * taux de réussite, répartition du jour, croissance du CA mois vs mois.
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [totalOrders, totalDelivered, terminalFailedCount, revenueAgg, todayHistory] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: 'DELIVERED' } }),
    prisma.order.count({ where: { status: { in: ['RETURNED', 'CANCELLED'] } } }),
    prisma.order.aggregate({ where: { status: 'DELIVERED' }, _sum: { totalAmount: true } }),
    prisma.orderStatusHistory.groupBy({
      by: ['toStatus'],
      where: { createdAt: { gte: startOfDay(new Date()) } },
      _count: true,
    }),
  ]);

  // Taux de réussite calculé sur les issues définitives uniquement (DELIVERED
  // vs RETURNED/CANCELLED) — les commandes encore en cours ne comptent pas.
  const attemptedOutcomes = totalDelivered + terminalFailedCount;
  const successRate = attemptedOutcomes > 0 ? totalDelivered / attemptedOutcomes : 0;

  const countFor = (statuses: OrderStatus[]) =>
    todayHistory.filter((row) => statuses.includes(row.toStatus)).reduce((sum, row) => sum + row._count, 0);

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [thisMonthRevenue, lastMonthRevenue] = await Promise.all([
    prisma.order.aggregate({
      where: { status: 'DELIVERED', delivery: { deliveredAt: { gte: startOfThisMonth } } },
      _sum: { totalAmount: true },
    }),
    prisma.order.aggregate({
      where: { status: 'DELIVERED', delivery: { deliveredAt: { gte: startOfLastMonth, lt: startOfThisMonth } } },
      _sum: { totalAmount: true },
    }),
  ]);

  const lastMonthTotal = Number(lastMonthRevenue._sum.totalAmount ?? 0);
  const thisMonthTotal = Number(thisMonthRevenue._sum.totalAmount ?? 0);
  const revenueGrowthPercent =
    lastMonthTotal > 0 ? round2(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100) : null;

  return {
    totalOrders,
    totalDelivered,
    totalRevenue: Number(revenueAgg._sum.totalAmount ?? 0),
    successRate: round2(successRate * 100),
    today: {
      delivered: countFor(['DELIVERED']),
      inProgress: countFor(IN_PROGRESS_STATUSES),
      problems: countFor(PROBLEM_STATUSES),
      returned: countFor(['RETURNED']),
    },
    revenueGrowthPercent,
  };
}

export interface DailyTrendPoint {
  date: string; // ISO yyyy-mm-dd
  ordersCreated: number;
  delivered: number;
  revenue: number;
}

/**
 * Série quotidienne pour le graphique de tendance du dashboard. Regroupe en
 * JS plutôt qu'en SQL brut : le volume est encore faible (MVP) et ça garde
 * la logique portable/testable sans requête raw.
 */
export async function getOrdersTrend(days = 14): Promise<DailyTrendPoint[]> {
  // Clés de date en UTC pur (jamais un mélange minuit-local + ISO-UTC : ça
  // décale la clé d'un jour dès que le serveur n'est pas en UTC+0).
  const toDateKey = (date: Date) => date.toISOString().slice(0, 10);
  const since = new Date(Date.now() - (days - 1) * 86_400_000);

  const [createdOrders, deliveredOrders] = await Promise.all([
    prisma.order.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.order.findMany({
      where: { status: 'DELIVERED', delivery: { deliveredAt: { gte: since } } },
      select: { totalAmount: true, delivery: { select: { deliveredAt: true } } },
    }),
  ]);

  const points = new Map<string, DailyTrendPoint>();
  for (let i = 0; i < days; i++) {
    const key = toDateKey(new Date(Date.now() - (days - 1 - i) * 86_400_000));
    points.set(key, { date: key, ordersCreated: 0, delivered: 0, revenue: 0 });
  }

  for (const order of createdOrders) {
    const key = toDateKey(order.createdAt);
    const point = points.get(key);
    if (point) point.ordersCreated += 1;
  }

  for (const order of deliveredOrders) {
    const deliveredAt = order.delivery?.deliveredAt;
    if (!deliveredAt) continue;
    const key = toDateKey(deliveredAt);
    const point = points.get(key);
    if (point) {
      point.delivered += 1;
      point.revenue = round2(point.revenue + Number(order.totalAmount));
    }
  }

  return [...points.values()];
}

export interface SupplierAnalytics {
  totalOrders: number;
  totalDelivered: number;
  totalRevenue: number; // net reçu par le fournisseur (après commission plateforme)
  pendingSettlementAmount: number; // livré + payé, pas encore inclus dans un versement
}

export async function getSupplierAnalytics(supplierId: string): Promise<SupplierAnalytics> {
  const [totalOrders, totalDelivered, payoutAgg, pendingAgg] = await Promise.all([
    prisma.order.count({ where: { supplierId } }),
    prisma.order.count({ where: { supplierId, status: 'DELIVERED' } }),
    prisma.order.aggregate({
      where: { supplierId, status: 'DELIVERED', paymentStatus: 'CONFIRMED' },
      _sum: { supplierPayoutAmount: true },
    }),
    prisma.order.aggregate({
      where: {
        supplierId,
        status: 'DELIVERED',
        paymentStatus: 'CONFIRMED',
        transactions: { none: { type: 'SUPPLIER_PAYOUT' } },
      },
      _sum: { supplierPayoutAmount: true },
    }),
  ]);

  return {
    totalOrders,
    totalDelivered,
    totalRevenue: Number(payoutAgg._sum.supplierPayoutAmount ?? 0),
    pendingSettlementAmount: Number(pendingAgg._sum.supplierPayoutAmount ?? 0),
  };
}
