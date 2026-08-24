import Link from 'next/link';
import { requirePageUser } from '@/shared/http/page-auth';
import { prisma } from '@/infrastructure/database/client';
import { Card } from '@/components/ui/Card';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import type { OrderStatusValue } from '@/components/order-status';

export const dynamic = 'force-dynamic';

export default async function SupplierOrdersPage() {
  const user = await requirePageUser(['SUPPLIER']);
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { userId: user.id } });

  const orders = await prisma.order.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: 'desc' },
    include: { customer: { select: { fullName: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Commandes</h1>
          <p className="text-sm text-ink-secondary">{orders.length} commande{orders.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/supplier/orders/import" className="rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink-primary hover:bg-slate-50">
            Importer un CSV
          </Link>
          <Link href="/supplier/orders/new" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            + Nouvelle commande
          </Link>
        </div>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Commande</th>
              <th className="pb-2 font-medium">Client</th>
              <th className="pb-2 font-medium">Créée le</th>
              <th className="pb-2 font-medium">Statut</th>
              <th className="pb-2 pr-0 text-right font-medium">Montant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="py-2.5">
                  <Link href={`/supplier/orders/${order.id}`} className="font-medium text-brand-600 hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="py-2.5 text-ink-secondary">{order.customer.fullName}</td>
                <td className="py-2.5 text-ink-secondary">
                  {order.createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="py-2.5">
                  <OrderStatusBadge status={order.status as OrderStatusValue} />
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink-primary">
                  {Number(order.totalAmount).toLocaleString('fr-FR')} MAD
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-ink-muted">
                  Aucune commande. Créez-en une pour commencer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
