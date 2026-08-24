import { listExceptions } from '@/modules/operations/exceptions.service';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { ExceptionActions } from '@/components/operations/ExceptionActions';
import { DriverMap } from '@/components/control-tower/DriverMap';
import Link from 'next/link';
import clsx from 'clsx';

export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = {
  SLA_AT_RISK: 'SLA à risque',
  SLA_BREACHED: 'SLA dépassé',
  REPEATED_FAILURE: 'Échecs répétés',
  DRIVER_SOS: 'Alerte SOS livreur',
};

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-status-critical/10 text-status-critical',
  HIGH: 'bg-[#c2410c]/10 text-[#c2410c]',
  MEDIUM: 'bg-status-warning/15 text-[#8a5a00]',
  LOW: 'bg-slate-100 text-ink-secondary',
};

const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: 'Critique',
  HIGH: 'Élevée',
  MEDIUM: 'Moyenne',
  LOW: 'Faible',
};

export default async function ControlTowerPage() {
  const exceptions = await listExceptions();

  const counts = {
    critical: exceptions.filter((e) => e.severity === 'CRITICAL').length,
    open: exceptions.filter((e) => e.status === 'OPEN').length,
    acknowledged: exceptions.filter((e) => e.status === 'ACKNOWLEDGED').length,
  };

  const activeSos = exceptions.filter((e) => e.type === 'DRIVER_SOS' && e.status !== 'RESOLVED');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Control Tower</h1>
        <p className="text-sm text-ink-secondary">
          Anomalies détectées automatiquement — dépassements SLA et échecs de livraison répétés.
        </p>
      </div>

      {activeSos.length > 0 && (
        <div className="animate-pulse rounded-lg border-2 border-status-critical bg-status-critical/10 p-4">
          <div className="mb-2 text-sm font-bold text-status-critical">
            🆘 {activeSos.length} alerte{activeSos.length > 1 ? 's' : ''} SOS active{activeSos.length > 1 ? 's' : ''}
          </div>
          <ul className="space-y-2">
            {activeSos.map((sos) => {
              const driver = sos.order.delivery?.driver;
              return (
                <li key={sos.id} className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-ink-primary">
                      {driver ? `${driver.user.firstName} ${driver.user.lastName} (${driver.driverCode})` : 'Livreur inconnu'}
                      {' · '}
                      <Link href={`/dashboard/orders/${sos.order.id}`} className="text-brand-600 hover:underline">
                        {sos.order.orderNumber}
                      </Link>
                    </div>
                    <div className="text-ink-secondary">{sos.description}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {driver && (
                      <a href={`tel:${driver.user.phone}`} className="rounded-md border border-hairline px-2.5 py-1.5 text-xs font-medium text-ink-primary">
                        📞 Appeler
                      </a>
                    )}
                    <ExceptionActions exceptionId={sos.id} status={sos.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <StatTile label="Exceptions actives" value={exceptions.length} />
        </Card>
        <Card>
          <StatTile label="Critiques" value={counts.critical} />
        </Card>
        <Card>
          <StatTile label="Prises en charge" value={counts.acknowledged} />
        </Card>
      </div>

      <Card>
        <CardHeader title="Carte opérationnelle" />
        <DriverMap />
      </Card>

      <Card>
        <CardHeader title="Exceptions ouvertes" />
        {exceptions.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            Aucune exception active — toutes les commandes en cours respectent leur SLA.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {exceptions.map((exception) => (
              <li key={exception.id} className="flex items-start justify-between gap-4 py-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        SEVERITY_STYLES[exception.severity]
                      )}
                    >
                      {SEVERITY_LABELS[exception.severity]}
                    </span>
                    <span className="text-xs text-ink-muted">{TYPE_LABELS[exception.type]}</span>
                    {exception.status === 'ACKNOWLEDGED' && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                        Pris en charge
                        {exception.acknowledgedBy &&
                          ` — ${exception.acknowledgedBy.firstName} ${exception.acknowledgedBy.lastName}`}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-ink-primary">{exception.description}</p>
                  <Link
                    href={`/dashboard/orders/${exception.orderId}`}
                    className="mt-1 inline-block text-xs text-brand-600 hover:underline"
                  >
                    {exception.order.orderNumber} · {exception.order.supplier.companyName} →
                  </Link>
                </div>
                <ExceptionActions exceptionId={exception.id} status={exception.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
