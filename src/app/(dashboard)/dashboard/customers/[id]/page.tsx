import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCustomerDetail, CustomerError } from '@/modules/customers/customers.service';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import type { OrderStatusValue } from '@/components/order-status';

export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const customer = await getCustomerDetail(params.id).catch((err) => {
    if (err instanceof CustomerError) return null;
    throw err;
  });
  if (!customer) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/customers" className="text-sm text-brand-600 hover:underline">
          ← Clients
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-primary">{customer.fullName}</h1>
        <p className="text-sm text-ink-secondary">
          {customer.phone}
          {customer.email && <> · {customer.email}</>}
          {' · Client depuis '}
          {new Date(customer.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
        {customer.notes && <p className="mt-1 text-sm text-ink-muted">{customer.notes}</p>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <StatTile label="Commandes totales" value={customer.stats.totalOrders} />
        </Card>
        <Card>
          <StatTile label="Livrées" value={customer.stats.deliveredOrders} />
        </Card>
        <Card>
          <StatTile label="Total dépensé" value={customer.stats.totalSpent} unit="MAD" />
        </Card>
      </div>

      {customer.addresses.length > 0 && (
        <Card>
          <CardHeader title="Adresses connues" />
          <ul className="space-y-2 text-sm">
            {customer.addresses.map((address) => (
              <li key={address.id} className="flex items-center justify-between border-b border-hairline pb-2 last:border-0">
                <div>
                  <div className="text-ink-primary">{address.fullAddress}</div>
                  <div className="text-xs text-ink-muted">
                    {address.label ?? 'Adresse'} · {address.city}
                  </div>
                </div>
                {address.isDefault && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">Par défaut</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title={`Historique des commandes (${customer.orders.length}${customer.stats.totalOrders > customer.orders.length ? ' plus récentes' : ''})`} />
        {customer.orders.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">Aucune commande.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
                <th className="pb-2 font-medium">Commande</th>
                <th className="pb-2 font-medium">Fournisseur</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Statut</th>
                <th className="pb-2 pr-0 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {customer.orders.map((order) => (
                <tr key={order.id} className="border-b border-hairline last:border-0">
                  <td className="py-2">
                    <Link href={`/dashboard/orders/${order.id}`} className="font-medium text-brand-600 hover:underline">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2 text-ink-secondary">{order.supplier.companyName}</td>
                  <td className="py-2 text-ink-secondary">
                    {new Date(order.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="py-2">
                    <OrderStatusBadge status={order.status as OrderStatusValue} />
                  </td>
                  <td className="py-2 pr-0 text-right text-ink-primary">{Number(order.totalAmount).toLocaleString('fr-FR')} MAD</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
