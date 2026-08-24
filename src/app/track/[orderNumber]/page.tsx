import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPublicTracking, TrackingError } from '@/modules/tracking/tracking.service';
import { ORDER_STATUS_META, type OrderStatusValue } from '@/components/order-status';
import { formatScheduledWindow } from '@/shared/utils/scheduling';
import { CustomerTrackingMap } from '@/components/tracking/CustomerTrackingMap';
import { DeliveryReviewForm } from '@/components/tracking/DeliveryReviewForm';
import { OrderChatPanel } from '@/components/chat/OrderChatPanel';
import clsx from 'clsx';

const CLOSED_CHAT_STATUSES: OrderStatusValue[] = ['DELIVERED', 'CANCELLED', 'RETURNED'];

export const dynamic = 'force-dynamic';

/**
 * Étapes affichées au client — langage chaleureux, volontairement différent
 * des libellés opérationnels internes (ORDER_STATUS_META). PENDING et
 * IN_TRANSIT sont fondus dans l'étape voisine : un client n'a pas besoin de
 * distinguer "en attente" de "confirmée", ni "en transit" de "en livraison".
 */
const CUSTOMER_STEPS: { status: OrderStatusValue; label: string }[] = [
  { status: 'CONFIRMED', label: 'Commande confirmée' },
  { status: 'READY_FOR_PICKUP', label: 'Colis préparé' },
  { status: 'ASSIGNED', label: 'Livreur affecté' },
  { status: 'PICKED_UP', label: 'Colis récupéré' },
  { status: 'OUT_FOR_DELIVERY', label: 'En cours de livraison' },
  { status: 'DELIVERED', label: 'Livré' },
];

const EXCEPTION_STATUSES: OrderStatusValue[] = [
  'CUSTOMER_ABSENT',
  'WRONG_ADDRESS',
  'CUSTOMER_REFUSED',
  'RESCHEDULED',
  'RETURNED',
  'CANCELLED',
];

export default async function TrackingPage({ params }: { params: { orderNumber: string } }) {
  const tracking = await getPublicTracking(decodeURIComponent(params.orderNumber)).catch((err) => {
    if (err instanceof TrackingError) return null;
    throw err;
  });

  if (!tracking) notFound();

  const reachedStatuses = new Set(tracking.timeline.map((entry) => entry.status));
  const currentStatus = tracking.status as OrderStatusValue;
  const isException = EXCEPTION_STATUSES.includes(currentStatus);

  return (
    <main className="min-h-screen bg-surface-page px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <Link href="/track" className="text-sm text-brand-600 hover:underline">
            LogiFlow
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-ink-primary">Votre commande</h1>
          <p className="text-sm text-ink-muted">{tracking.orderNumber}</p>
        </div>

        {tracking.scheduledFor && currentStatus !== 'DELIVERED' && (
          <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-center text-sm font-medium text-brand-700">
            📅 Livraison prévue le {formatScheduledWindow(tracking.scheduledFor, tracking.scheduledWindowMinutes)}
          </div>
        )}

        <div className="rounded-lg border border-hairline bg-surface p-5">
          <ol className="space-y-4">
            {CUSTOMER_STEPS.map((step) => {
              // DELIVERED est un état terminal réussi : sa propre étape doit
              // s'afficher comme "terminée" (✓ vert), pas "en cours" (● bleu)
              // — il n'y a pas d'étape suivante vers laquelle progresser.
              const isFullyDelivered = currentStatus === 'DELIVERED';
              const done = reachedStatuses.has(step.status) && (step.status !== currentStatus || isFullyDelivered);
              const current = step.status === currentStatus && !isFullyDelivered;
              return (
                <li key={step.status} className="flex items-center gap-3">
                  <span
                    className={clsx(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                      done && 'bg-[#0ca30c] text-white',
                      current && 'bg-brand-600 text-white',
                      !done && !current && 'bg-slate-100 text-ink-muted'
                    )}
                    aria-hidden
                  >
                    {done ? '✓' : current ? '●' : '○'}
                  </span>
                  <span
                    className={clsx(
                      'text-sm',
                      (done || current) && 'font-medium text-ink-primary',
                      !done && !current && 'text-ink-muted'
                    )}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {isException && (
            <div
              className={clsx(
                'mt-4 rounded-md px-3 py-2 text-sm font-medium',
                ORDER_STATUS_META[currentStatus].tone === 'critical'
                  ? 'bg-status-critical/10 text-status-critical'
                  : 'bg-status-warning/15 text-[#8a5a00]'
              )}
            >
              {ORDER_STATUS_META[currentStatus].symbol} {ORDER_STATUS_META[currentStatus].label}
            </div>
          )}
        </div>

        {tracking.driver && (
          <div className="mt-4 rounded-lg border border-hairline bg-surface p-4 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">Livreur</div>
            <div className="mt-1 text-ink-primary">
              {tracking.driver.code} — {tracking.driver.vehicle === 'MOTORCYCLE' ? 'Moto' : tracking.driver.vehicle}
            </div>

            {tracking.eta && (
              <div className="mt-2 rounded-md bg-brand-50 px-3 py-2 text-brand-700">
                Livraison estimée avant{' '}
                <strong>
                  {new Date(tracking.eta).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </strong>
              </div>
            )}

            {tracking.driverPosition && (
              <div className="mt-3">
                <div className="mb-1 text-xs text-ink-muted">Position actuelle de votre livreur</div>
                <CustomerTrackingMap lat={tracking.driverPosition.lat} lng={tracking.driverPosition.lng} />
              </div>
            )}

            {!CLOSED_CHAT_STATUSES.includes(currentStatus) && (
              <div className="mt-3">
                <div className="mb-1 text-xs text-ink-muted">Un message pour votre livreur ?</div>
                <OrderChatPanel
                  fetchUrl={`/api/v1/tracking/${encodeURIComponent(tracking.orderNumber)}/messages`}
                  sendUrl={`/api/v1/tracking/${encodeURIComponent(tracking.orderNumber)}/messages`}
                  myRole="CUSTOMER"
                />
              </div>
            )}
          </div>
        )}

        {tracking.deliveredAt && (
          <div className="mt-4 rounded-lg border border-[#0ca30c]/30 bg-[#0ca30c]/5 p-4 text-center text-sm">
            <div className="font-medium text-[#006300]">✓ Livré le</div>
            <div className="mt-1 text-ink-primary">
              {new Date(tracking.deliveredAt).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        )}

        {currentStatus === 'DELIVERED' && (
          <div className="mt-4">
            {tracking.review ? (
              <div className="rounded-lg border border-hairline bg-surface p-4 text-center text-sm">
                <div className="text-lg text-[#f5a623]">{'★'.repeat(tracking.review.rating)}{'☆'.repeat(5 - tracking.review.rating)}</div>
                <div className="mt-1 text-ink-muted">Merci pour votre avis !</div>
                {tracking.review.comment && <p className="mt-2 text-ink-primary">&laquo;&nbsp;{tracking.review.comment}&nbsp;&raquo;</p>}
              </div>
            ) : (
              <DeliveryReviewForm orderNumber={tracking.orderNumber} />
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-ink-muted">
          Commande passée le{' '}
          {new Date(tracking.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
      </div>
    </main>
  );
}
