import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupplierProfile } from '@/modules/suppliers/suppliers.service';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'En attente',
  ACTIVE: 'Actif',
  REJECTED: 'Refusé',
  SUSPENDED: 'Suspendu',
  TERMINATED: 'Résilié',
};

export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
  const supplier = await getSupplierProfile(params.id).catch(() => null);
  if (!supplier) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/suppliers" className="text-sm text-brand-600 hover:underline">
          ← Fournisseurs
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-primary">{supplier.companyName}</h1>
        <p className="text-sm text-ink-secondary">
          {supplier.user.firstName} {supplier.user.lastName} · {supplier.user.phone}
          {supplier.user.email ? ` · ${supplier.user.email}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <StatTile label="Commandes totales" value={supplier.analytics.totalOrders} />
        </Card>
        <Card>
          <StatTile label="Livrées" value={supplier.analytics.totalDelivered} />
        </Card>
        <Card>
          <StatTile label="Revenu net perçu (MAD)" value={supplier.analytics.totalRevenue} />
        </Card>
        <Card>
          <StatTile label="En attente de versement (MAD)" value={supplier.analytics.pendingSettlementAmount} />
        </Card>
      </div>

      <Card>
        <CardHeader title="Informations fournisseur" />
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="Statut" value={STATUS_LABELS[supplier.status] ?? supplier.status} />
          <Row label="Commission" value={`${Number(supplier.defaultCommissionRate)}%`} />
          <Row label="Produits au catalogue" value={String(supplier._count.products)} />
          <Row label="Identifiant fiscal" value={supplier.taxId ?? '—'} />
          <Row label="Adresse de facturation" value={supplier.billingAddress ?? '—'} />
          <Row label="Contact facturation" value={supplier.contactEmail ?? supplier.contactPhone ?? '—'} />
          <Row
            label="Inscrit le"
            value={new Date(supplier.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
          />
          {supplier.status === 'REJECTED' && supplier.rejectionReason && (
            <Row label="Motif de refus" value={supplier.rejectionReason} />
          )}
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
