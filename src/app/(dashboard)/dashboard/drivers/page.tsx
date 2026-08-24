import Link from 'next/link';
import { listDrivers } from '@/modules/drivers/drivers.service';
import { Card } from '@/components/ui/Card';
import clsx from 'clsx';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'En attente',
  AVAILABLE: 'Disponible',
  BUSY: 'En course',
  OFFLINE: 'Hors ligne',
  SUSPENDED: 'Suspendu',
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING_APPROVAL: 'bg-slate-100 text-ink-secondary',
  AVAILABLE: 'bg-[#0ca30c]/10 text-[#006300]',
  BUSY: 'bg-brand-50 text-brand-700',
  OFFLINE: 'bg-slate-100 text-ink-muted',
  SUSPENDED: 'bg-status-critical/10 text-status-critical',
};

export default async function DriversPage() {
  const drivers = await listDrivers();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Livreurs</h1>
        <p className="text-sm text-ink-secondary">{drivers.length} livreur{drivers.length > 1 ? 's' : ''}</p>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Code</th>
              <th className="pb-2 font-medium">Nom</th>
              <th className="pb-2 font-medium">Téléphone</th>
              <th className="pb-2 font-medium">Zones</th>
              <th className="pb-2 font-medium">Statut</th>
              <th className="pb-2 pr-0 text-right font-medium">Solde société</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {drivers.map((driver) => (
              <tr key={driver.id}>
                <td className="py-2.5">
                  <Link href={`/dashboard/drivers/${driver.id}`} className="font-medium text-brand-600 hover:underline">
                    {driver.driverCode}
                  </Link>
                </td>
                <td className="py-2.5 text-ink-secondary">
                  {driver.user.firstName} {driver.user.lastName}
                </td>
                <td className="py-2.5 text-ink-secondary">{driver.user.phone}</td>
                <td className="py-2.5 text-ink-secondary">
                  {driver.zones.map((dz) => dz.zone.name).join(', ') || '—'}
                </td>
                <td className="py-2.5">
                  <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', STATUS_CLASSES[driver.status])}>
                    {STATUS_LABELS[driver.status]}
                  </span>
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink-primary">
                  {Number(driver.walletBalance).toLocaleString('fr-FR')} MAD
                </td>
              </tr>
            ))}
            {drivers.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-ink-muted">
                  Aucun livreur enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
