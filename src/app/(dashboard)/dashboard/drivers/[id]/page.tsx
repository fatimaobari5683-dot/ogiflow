import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDriverProfile } from '@/modules/drivers/drivers.service';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { DriverZoneAssignment } from '@/components/drivers/DriverZoneAssignment';
import { DriverTierBadge } from '@/components/drivers/DriverTierBadge';

export const dynamic = 'force-dynamic';

export default async function DriverDetailPage({ params }: { params: { id: string } }) {
  const driver = await getDriverProfile(params.id).catch(() => null);
  if (!driver) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/drivers" className="text-sm text-brand-600 hover:underline">
          ← Livreurs
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold text-ink-primary">
          {driver.driverCode} — {driver.user.firstName} {driver.user.lastName}
          <DriverTierBadge tier={driver.performance.tier} />
        </h1>
        <p className="text-sm text-ink-secondary">
          {driver.user.phone} · {driver.vehicleType}
          {driver.baseZone ? ` · zone principale : ${driver.baseZone.name}` : ''}
        </p>
        {driver.address && <p className="text-sm text-ink-muted">{driver.address}</p>}
      </div>

      <Card>
        <CardHeader title="Zones de service" />
        <p className="mb-3 text-xs text-ink-muted">
          Zones où ce livreur accepte des missions — pilote le score de correspondance géographique (zoneMatch) au dispatch.
          Cliquez pour assigner ou retirer une zone.
        </p>
        <DriverZoneAssignment driverId={driver.id} assignedZoneIds={driver.zones.map((z) => z.zoneId)} />
      </Card>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <StatTile label="Taux de réussite" value={Math.round(driver.performance.successRate * 100)} unit="%" />
        </Card>
        <Card>
          <StatTile label="Livraisons actives" value={driver.performance.activeDeliveries} />
        </Card>
        <Card>
          <StatTile label="Livrées (7 derniers jours)" value={driver.performance.deliveredLast7Days} />
        </Card>
        <Card>
          <StatTile label="Solde à reverser" value={driver.performance.walletBalance} unit="MAD" />
        </Card>
      </div>

      <Card>
        <CardHeader title="Performance détaillée" />
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="Tentatives totales" value={String(driver.performance.totalAttempts)} />
          <Row label="Tentatives réussies" value={String(driver.performance.successfulAttempts)} />
          <Row label="Taux d'échec" value={`${Math.round(driver.performance.failureRate * 100)}%`} />
          <Row label="Cash encaissé (COD)" value={`${driver.performance.cashCollected.toLocaleString('fr-FR')} MAD`} />
          <Row label="Commission" value={`${Number(driver.commissionRate)}%`} />
          <Row label="Statut" value={driver.status} />
          <Row
            label="Note moyenne clients"
            value={
              driver.performance.averageRating !== null
                ? `${driver.performance.averageRating.toFixed(1)} ★ (${driver.performance.reviewCount} avis)`
                : 'Pas encore d\'avis'
            }
          />
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-hairline pb-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink-primary">{value}</dd>
    </div>
  );
}
