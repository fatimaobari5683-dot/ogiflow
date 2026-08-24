import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/shared/http/page-auth';
import { getDeliveryDetail } from '@/modules/deliveries/deliveries.service';
import { prisma } from '@/infrastructure/database/client';
import { MissionActions } from '@/components/driver/MissionActions';
import { OrderStatusBadge } from '@/components/ui/OrderStatusBadge';
import { OrderChatPanel } from '@/components/chat/OrderChatPanel';
import { SosButton } from '@/components/driver/SosButton';
import type { OrderStatusValue } from '@/components/order-status';

export const dynamic = 'force-dynamic';

const CLOSED_CHAT_STATUSES: OrderStatusValue[] = ['DELIVERED', 'CANCELLED', 'RETURNED'];

export default async function MissionDetailPage({ params }: { params: { orderId: string } }) {
  const user = await requirePageUser(['DRIVER']);

  const delivery = await getDeliveryDetail(params.orderId, { actorId: user.id, actorRole: 'DRIVER' }).catch(() => null);
  if (!delivery) notFound();

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: params.orderId },
    include: { customer: true, address: true, items: { include: { product: true } } },
  });

  const mapsUrl = order.address.latitude && order.address.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${order.address.latitude},${order.address.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address.fullAddress)}`;

  return (
    <div className="space-y-4">
      <Link href="/missions" className="text-sm text-brand-600 hover:underline">
        ← Mes missions
      </Link>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-ink-primary">{order.orderNumber}</h1>
          <OrderStatusBadge status={order.status as OrderStatusValue} />
        </div>
        <p className="text-sm text-ink-secondary">{order.customer.fullName}</p>
        <Link href={`/orders/${order.id}/label`} className="text-sm text-brand-600 hover:underline">
          🖨️ Voir le bordereau
        </Link>
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Adresse</div>
        <p className="mt-1 text-sm text-ink-primary">{order.address.fullAddress}</p>
        <p className="text-sm text-ink-secondary">{order.address.city}</p>
        {order.instructions && (
          <p className="mt-2 rounded-md bg-status-warning/10 px-2 py-1.5 text-sm text-ink-secondary">
            📌 {order.instructions}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-md border border-hairline py-2.5 text-sm font-medium text-ink-primary"
          >
            🧭 Naviguer
          </a>
          <a
            href={`tel:${order.customer.phone}`}
            className="flex items-center justify-center gap-2 rounded-md border border-hairline py-2.5 text-sm font-medium text-ink-primary"
          >
            📞 Appeler
          </a>
        </div>
      </div>

      {!CLOSED_CHAT_STATUSES.includes(order.status as OrderStatusValue) && <SosButton orderId={order.id} />}

      {!CLOSED_CHAT_STATUSES.includes(order.status as OrderStatusValue) && (
        <OrderChatPanel
          fetchUrl={`/api/v1/deliveries/orders/${order.id}/messages`}
          sendUrl={`/api/v1/deliveries/orders/${order.id}/messages`}
          myRole="DRIVER"
        />
      )}

      {order.paymentMethod === 'CASH_ON_DELIVERY' && (
        <div className="flex items-center justify-between rounded-lg border border-brand-500 bg-brand-50 px-4 py-3">
          <span className="text-sm font-medium text-brand-700">À encaisser (COD)</span>
          <span className="text-lg font-semibold text-brand-700">
            {Number(order.totalAmount).toLocaleString('fr-FR')} MAD
          </span>
        </div>
      )}

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Articles</div>
        <ul className="mt-2 space-y-1 text-sm text-ink-secondary">
          {order.items.map((item) => (
            <li key={item.id}>
              {item.quantity}× {item.product.name}
            </li>
          ))}
        </ul>
      </div>

      <MissionActions orderId={order.id} status={order.status} />
    </div>
  );
}
