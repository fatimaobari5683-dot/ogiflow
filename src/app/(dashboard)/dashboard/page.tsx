import { getDashboardSummary, getOrdersTrend } from '@/modules/analytics/analytics.service';
import { listExceptions } from '@/modules/operations/exceptions.service';
import { prisma } from '@/infrastructure/database/client';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import { TrendChart } from '@/components/charts/TrendChart';
import { TodayBreakdown } from '@/components/charts/TodayBreakdown';
import Link from 'next/link';
import clsx from 'clsx';
import type { OrderStatusValue } from '@/components/order-status';

export const dynamic = 'force-dynamic';

async function getRecentOrders() {
  return prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: { customer: { select: { fullName: true } }, supplier: { select: { companyName: true } } },
  });
}

export default async function DashboardPage() {
  const [summary, trend, recentOrders, exceptions] = await Promise.all([
    getDashboardSummary(),
    getOrdersTrend(14),
    getRecentOrders(),
    listExceptions(),
  ]);
  const criticalCount = exceptions.filter((e) => e.severity === 'CRITICAL').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Vue d&apos;ensemble</h1>
        <p className="text-sm text-ink-secondary">Activité de la plateforme en temps réel.</p>
      </div>

      {exceptions.length > 0 && (
        <Link
          href="/dashboard/control-tower"
          className={clsx(
            'block rounded-md px-4 py-3 text-sm font-medium transition-colors',
            criticalCount > 0
              ? 'bg-status-critical/10 text-status-critical hover:bg-status-critical/15'
              : 'bg-status-warning/15 text-[#8a5a00] hover:bg-status-warning/20'
          )}
        >
          {exceptions.length} exception{exceptions.length > 1 ? 's' : ''} active
          {exceptions.length > 1 ? 's' : ''}
          {criticalCount > 0 ? ` dont ${criticalCount} critique${criticalCount > 1 ? 's' : ''}` : ''} — voir le
          Control Tower →
        </Link>
      )}

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <StatTile label="Commandes totales" value={summary.totalOrders} />
        </Card>
        <Card>
          <StatTile label="Livrées" value={summary.totalDelivered} />
        </Card>
        <Card>
          <StatTile
            label="Chiffre d'affaires (MAD)"
            value={summary.totalRevenue}
            deltaPercent={summary.revenueGrowthPercent}
            deltaLabel="vs mois dernier"
          />
        </Card>
        <Card>
          <StatTile label="Taux de réussite" value={summary.successRate} unit="%" />
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader title="Commandes livrées — 14 derniers jours" />
          <TrendChart data={trend} />
        </Card>
        <Card>
          <CardHeader title="Aujourd'hui" />
          <TodayBreakdown
            delivered={summary.today.delivered}
            inProgress={summary.today.inProgress}
            problems={summary.today.problems}
            returned={summary.today.returned}
          />
        </Card>
      </div>

      <Card>
        <CardHeader title="Commandes récentes" action={<Link href="/dashboard/orders" className="text-sm text-brand-600 hover:underline">Voir tout →</Link>} />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Commande</th>
              <th className="pb-2 font-medium">Fournisseur</th>
              <th className="pb-2 font-medium">Client</th>
              <th className="pb-2 font-medium">Statut</th>
              <th className="pb-2 pr-0 text-right font-medium">Montant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {recentOrders.map((order) => (
              <tr key={order.id}>
                <td className="py-2.5">
                  <Link href={`/dashboard/orders/${order.id}`} className="font-medium text-brand-600 hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="py-2.5 text-ink-secondary">{order.supplier.companyName}</td>
                <td className="py-2.5 text-ink-secondary">{order.customer.fullName}</td>
                <td className="py-2.5">
                  <OrderStatusBadge status={order.status as OrderStatusValue} />
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink-primary">
                  {Number(order.totalAmount).toLocaleString('fr-FR')} MAD
                </td>
              </tr>
            ))}
            {recentOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-ink-muted">
                  Aucune commande pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
