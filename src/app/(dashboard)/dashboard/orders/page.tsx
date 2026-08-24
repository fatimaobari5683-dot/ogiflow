import Link from 'next/link';
import { prisma } from '@/infrastructure/database/client';
import { Card } from '@/components/ui/Card';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import { ORDER_STATUS_META, type OrderStatusValue } from '@/components/order-status';
import clsx from 'clsx';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string };
}) {
  const status = searchParams.status as OrderStatusValue | undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where = status ? { status } : {};

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: { select: { fullName: true } }, supplier: { select: { companyName: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Commandes</h1>
        <p className="text-sm text-ink-secondary">{total} commande{total > 1 ? 's' : ''}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip href="/dashboard/orders" label="Toutes" active={!status} />
        {(Object.keys(ORDER_STATUS_META) as OrderStatusValue[]).map((s) => (
          <FilterChip key={s} href={`/dashboard/orders?status=${s}`} label={ORDER_STATUS_META[s].label} active={status === s} />
        ))}
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Commande</th>
              <th className="pb-2 font-medium">Fournisseur</th>
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
                  <Link href={`/dashboard/orders/${order.id}`} className="font-medium text-brand-600 hover:underline">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="py-2.5 text-ink-secondary">{order.supplier.companyName}</td>
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
                <td colSpan={6} className="py-6 text-center text-ink-muted">
                  Aucune commande pour ce filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <PageLink status={status} page={page - 1} disabled={page <= 1} label="← Précédent" />
            <span className="text-ink-muted">
              Page {page} / {totalPages}
            </span>
            <PageLink status={status} page={page + 1} disabled={page >= totalPages} label="Suivant →" />
          </div>
        )}
      </Card>
    </div>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={clsx(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-secondary hover:bg-slate-200'
      )}
    >
      {label}
    </Link>
  );
}

function PageLink({ status, page, disabled, label }: { status?: string; page: number; disabled: boolean; label: string }) {
  const href = `/dashboard/orders?${status ? `status=${status}&` : ''}page=${page}`;
  if (disabled) {
    return <span className="text-ink-muted opacity-50">{label}</span>;
  }
  return (
    <Link href={href} className="text-brand-600 hover:underline">
      {label}
    </Link>
  );
}
