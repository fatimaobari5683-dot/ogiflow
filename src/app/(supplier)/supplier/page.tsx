import Link from 'next/link';
import { requirePageUser } from '@/shared/http/page-auth';
import { prisma } from '@/infrastructure/database/client';
import { getSupplierAnalytics } from '@/modules/analytics/analytics.service';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import type { OrderStatusValue } from '@/components/order-status';

export const dynamic = 'force-dynamic';

export default async function SupplierOverviewPage() {
  const user = await requirePageUser(['SUPPLIER']);
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { userId: user.id } });
  const analytics = await getSupplierAnalytics(supplier.id);

  const recentOrders = await prisma.order.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: 'desc' },
    take: 6,
    include: { customer: { select: { fullName: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Vue d&apos;ensemble</h1>
        <p className="text-sm text-ink-secondary">{supplier.companyName}</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <StatTile label="Commandes totales" value={analytics.totalOrders} />
        </Card>
        <Card>
          <StatTile label="Livrées" value={analytics.totalDelivered} />
        </Card>
        <Card>
          <StatTile label="Revenu net (MAD)" value={analytics.totalRevenue} />
        </Card>
        <Card>
          <StatTile label="En attente de versement (MAD)" value={analytics.pendingSettlementAmount} />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Commandes récentes"
          action={
            <Link href="/supplier/orders/new" className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
              + Nouvelle commande
            </Link>
          }
        />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Commande</th>
              <th className="pb-2 font-medium">Client</th>
              <th className="pb-2 font-medium">Statut</th>
              <th className="pb-2 pr-0 text-right font-medium">Montant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {recentOrders.map((order) => (
              <tr key={order.id}>
                <td className="py-2.5">
                  <Link href={`/supplier/orders/${order.id}`} className="font-medium text-brand-600 hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
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
                <td colSpan={4} className="py-6 text-center text-ink-muted">
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
