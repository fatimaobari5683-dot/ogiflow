import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrderDetail } from '@/modules/orders/orders.service';
import { Card, CardHeader } from '@/components/ui/Card';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import { OrderActions } from '@/components/orders/OrderActions';
import { ORDER_STATUS_META, type OrderStatusValue } from '@/components/order-status';
import { formatScheduledWindow } from '@/shared/utils/scheduling';
import { prisma } from '@/infrastructure/database/client';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const order = await getOrderDetail(params.id).catch(() => null);
  if (!order) notFound();

  const driver = order.delivery?.driverId
    ? await prisma.driver.findUnique({
        where: { id: order.delivery.driverId },
        select: { driverCode: true, vehicleType: true, user: { select: { firstName: true, lastName: true, phone: true } } },
      })
    : null;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/orders" className="text-sm text-brand-600 hover:underline">
          ← Commandes
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-ink-primary">{order.orderNumber}</h1>
          <OrderStatusBadge status={order.status as OrderStatusValue} />
          <Link href={`/orders/${order.id}/label`} className="text-sm text-brand-600 hover:underline">
            🖨️ Bordereau
          </Link>
          <Link href={`/orders/${order.id}/invoice`} className="text-sm text-brand-600 hover:underline">
            🧾 Facture
          </Link>
        </div>
        {order.scheduledFor && (
          <p className="mt-1 inline-block rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
            📅 Programmée : {formatScheduledWindow(order.scheduledFor, order.scheduledWindowMinutes)}
          </p>
        )}
        <p className="text-sm text-ink-secondary">
          Créée le {order.createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader title="Actions" />
            <OrderActions orderId={order.id} status={order.status} />
          </Card>

          <Card>
            <CardHeader title="Articles" />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
                  <th className="pb-2 font-medium">Produit</th>
                  <th className="pb-2 font-medium">Qté</th>
                  <th className="pb-2 font-medium">Prix unitaire</th>
                  <th className="pb-2 pr-0 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2">{item.product.name}</td>
                    <td className="py-2">{item.quantity}</td>
                    <td className="py-2">{Number(item.unitPrice).toLocaleString('fr-FR')} MAD</td>
                    <td className="py-2 text-right tabular-nums">{Number(item.lineTotal).toLocaleString('fr-FR')} MAD</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-1 border-t border-hairline pt-3 text-sm">
              <SummaryRow label="Sous-total" value={order.subtotalAmount} />
              <SummaryRow label="Frais de livraison" value={order.deliveryFee} />
              {Number(order.discountAmount) > 0 && (
                <SummaryRow label={`Réduction (${order.promoCode?.code ?? 'code promo'})`} value={-Number(order.discountAmount)} />
              )}
              <SummaryRow label="Commission plateforme" value={order.commissionAmount} muted />
              <SummaryRow label="Total client" value={order.totalAmount} bold />
            </div>
          </Card>

          <Card>
            <CardHeader title="Historique" />
            <ol className="space-y-2">
              {order.statusHistory.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <div>
                    <span className="font-medium text-ink-primary">{ORDER_STATUS_META[entry.toStatus as OrderStatusValue]?.label ?? entry.toStatus}</span>
                    <span className="ml-2 text-ink-muted">
                      {entry.createdAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {entry.reason && <p className="text-ink-secondary">{entry.reason}</p>}
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
              {order.instructions && <Row label="Instructions" value={order.instructions} />}
            </dl>
          </Card>

          {driver && (
            <Card>
              <CardHeader title="Livreur" />
              <dl className="space-y-1.5 text-sm">
                <Row label="Code" value={driver.driverCode} />
                <Row label="Nom" value={`${driver.user.firstName} ${driver.user.lastName}`} />
                <Row label="Téléphone" value={driver.user.phone} />
                <Row label="Véhicule" value={driver.vehicleType} />
              </dl>
            </Card>
          )}

          {order.delivery?.proofType && (
            <Card>
              <CardHeader title="Preuve de livraison" />
              <dl className="space-y-1.5 text-sm">
                <Row label="Type" value={order.delivery.proofType} />
                <Row
                  label="Livrée le"
                  value={
                    order.delivery.deliveredAt
                      ? order.delivery.deliveredAt.toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'
                  }
                />
              </dl>
              {(order.delivery.proofType === 'PHOTO' || order.delivery.proofType === 'SIGNATURE') && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/v1/deliveries/orders/${order.id}/proof`}
                  alt={order.delivery.proofType === 'PHOTO' ? 'Photo de livraison' : 'Signature du client'}
                  className="mt-3 max-h-64 w-full rounded-md border border-hairline object-contain"
                />
              )}
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

function SummaryRow({ label, value, bold, muted }: { label: string; value: unknown; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? 'text-ink-muted' : 'text-ink-secondary'}>{label}</span>
      <span className={bold ? 'font-semibold text-ink-primary' : 'tabular-nums text-ink-primary'}>
        {Number(value).toLocaleString('fr-FR')} MAD
      </span>
    </div>
  );
}
