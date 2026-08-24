import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/shared/http/page-auth';
import { prisma } from '@/infrastructure/database/client';
import { Card, CardHeader } from '@/components/ui/Card';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import { CancelOrderButton } from '@/components/supplier/CancelOrderButton';
import { ORDER_STATUS_META, type OrderStatusValue } from '@/components/order-status';

export const dynamic = 'force-dynamic';

const CANCELLABLE_STATUSES = ['PENDING', 'CONFIRMED'];

export default async function SupplierOrderDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePageUser(['SUPPLIER']);
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { userId: user.id } });

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      address: true,
      items: { include: { product: true } },
      statusHistory: { orderBy: { createdAt: 'asc' } },
      delivery: { include: { driver: { select: { driverCode: true, vehicleType: true } } } },
      promoCode: { select: { code: true } },
    },
  });

  if (!order || order.supplierId !== supplier.id) notFound();

  return (
    <div className="space-y-4">
      <Link href="/supplier/orders" className="text-sm text-brand-600 hover:underline">
        ← Commandes
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-ink-primary">{order.orderNumber}</h1>
        <OrderStatusBadge status={order.status as OrderStatusValue} />
        <Link href={`/orders/${order.id}/label`} className="text-sm text-brand-600 hover:underline">
          🖨️ Bordereau
        </Link>
      </div>
      <p className="text-sm text-ink-secondary">
        Créée le {order.createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </p>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          {CANCELLABLE_STATUSES.includes(order.status) && (
            <Card>
              <CardHeader title="Actions" />
              <CancelOrderButton orderId={order.id} />
            </Card>
          )}

          <Card>
            <CardHeader title="Articles" />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
                  <th className="pb-2 font-medium">Produit</th>
                  <th className="pb-2 font-medium">Qté</th>
                  <th className="pb-2 pr-0 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2">{item.product.name}</td>
                    <td className="py-2">{item.quantity}</td>
                    <td className="py-2 text-right tabular-nums">{Number(item.lineTotal).toLocaleString('fr-FR')} MAD</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-1 border-t border-hairline pt-3 text-sm">
              <div className="flex justify-between text-ink-secondary">
                <span>Sous-total</span>
                <span>{Number(order.subtotalAmount).toLocaleString('fr-FR')} MAD</span>
              </div>
              <div className="flex justify-between text-ink-secondary">
                <span>Frais de livraison</span>
                <span>{Number(order.deliveryFee).toLocaleString('fr-FR')} MAD</span>
              </div>
              {Number(order.discountAmount) > 0 && (
                <div className="flex justify-between text-ink-secondary">
                  <span>Réduction ({order.promoCode?.code ?? 'code promo'})</span>
                  <span>−{Number(order.discountAmount).toLocaleString('fr-FR')} MAD</span>
                </div>
              )}
              <div className="flex justify-between text-ink-muted">
                <span>Commission plateforme</span>
                <span>−{Number(order.commissionAmount).toLocaleString('fr-FR')} MAD</span>
              </div>
              <div className="flex justify-between font-semibold text-ink-primary">
                <span>Votre revenu net</span>
                <span>{Number(order.supplierPayoutAmount).toLocaleString('fr-FR')} MAD</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Historique" />
            <ol className="space-y-2">
              {order.statusHistory.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <div>
                    <span className="font-medium text-ink-primary">
                      {ORDER_STATUS_META[entry.toStatus as OrderStatusValue]?.label ?? entry.toStatus}
                    </span>
                    <span className="ml-2 text-ink-muted">
                      {entry.createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Client" />
            <dl className="space-y-1.5 text-sm">
              <Row label="Nom" value={order.customer.fullName} />
              <Row label="Téléphone" value={order.customer.phone} />
              <Row label="Adresse" value={order.address.fullAddress} />
              <Row label="Ville" value={order.address.city} />
            </dl>
          </Card>

          {order.delivery?.driver && (
            <Card>
              <CardHeader title="Livreur" />
              <dl className="space-y-1.5 text-sm">
                <Row label="Code" value={order.delivery.driver.driverCode} />
                <Row label="Véhicule" value={order.delivery.driver.vehicleType} />
              </dl>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right text-ink-primary">{value}</dd>
    </div>
  );
}
