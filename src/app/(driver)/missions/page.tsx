import Link from 'next/link';
import { requirePageUser } from '@/shared/http/page-auth';
import { getDriverByUserId } from '@/modules/drivers/drivers.service';
import { getMyMissions } from '@/modules/deliveries/deliveries.service';
import { ORDER_STATUS_META, type OrderStatusValue } from '@/components/order-status';
import { PendingOffers } from '@/components/driver/PendingOffers';

export const dynamic = 'force-dynamic';

export default async function MissionsPage() {
  const user = await requirePageUser(['DRIVER']);
  const driver = await getDriverByUserId(user.id);
  if (!driver) return null;

  const missions = await getMyMissions(driver.id);
  const nextMission = missions[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Bonjour {user.firstName}</h1>
        <p className="text-sm text-ink-secondary">
          {missions.length} mission{missions.length !== 1 ? 's' : ''} en cours
        </p>
      </div>

      <PendingOffers driverId={driver.id} commissionRate={Number(driver.commissionRate)} />

      {nextMission && (
        <Link
          href={`/missions/${nextMission.order.id}`}
          className="block rounded-lg border-2 border-brand-500 bg-brand-50 p-4"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-brand-700">
            {missions.length > 1 ? `Arrêt 1 / ${missions.length} — prochain` : 'Prochaine livraison'}
          </div>
          <div className="mt-1 text-lg font-semibold text-ink-primary">{nextMission.order.customer.fullName}</div>
          <div className="text-sm text-ink-secondary">{nextMission.order.address.fullAddress}</div>
          <div className="mt-2 flex items-center justify-between">
            <OrderStatusPill status={nextMission.order.status as OrderStatusValue} />
            {nextMission.order.paymentMethod === 'CASH_ON_DELIVERY' && (
              <span className="text-sm font-semibold text-ink-primary">
                COD : {Number(nextMission.order.totalAmount).toLocaleString('fr-FR')} MAD
              </span>
            )}
          </div>
        </Link>
      )}

      <div className="space-y-2">
        {missions.length === 0 && (
          <div className="rounded-lg border border-hairline bg-surface p-6 text-center text-sm text-ink-muted">
            Aucune mission active. Restez disponible pour recevoir de nouvelles courses.
          </div>
        )}

        {missions.slice(1).map((mission, index) => (
          <Link
            key={mission.id}
            href={`/missions/${mission.order.id}`}
            className="flex items-center justify-between rounded-lg border border-hairline bg-surface p-3"
          >
            <div>
              <div className="font-medium text-ink-primary">{mission.order.customer.fullName}</div>
              <div className="text-xs text-ink-muted">
                Arrêt {index + 2} / {missions.length} · {mission.order.orderNumber}
              </div>
            </div>
            <OrderStatusPill status={mission.order.status as OrderStatusValue} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function OrderStatusPill({ status }: { status: OrderStatusValue }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-medium text-ink-secondary">
      <span aria-hidden>{meta.symbol}</span>
      {meta.label}
    </span>
  );
}
