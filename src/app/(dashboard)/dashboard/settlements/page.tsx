import Link from 'next/link';
import { listSettlements } from '@/modules/settlements/settlements.service';
import { prisma } from '@/infrastructure/database/client';
import { Card, CardHeader } from '@/components/ui/Card';
import { GenerateSettlementForm } from '@/components/settlements/GenerateSettlementForm';
import { SettlementActions } from '@/components/settlements/SettlementActions';
import clsx from 'clsx';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  PENDING_PAYMENT: 'En attente de paiement',
  PAID: 'Payé',
  DISPUTED: 'Contesté',
};

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-ink-secondary',
  PENDING_PAYMENT: 'bg-status-warning/15 text-[#8a5a00]',
  PAID: 'bg-[#0ca30c]/10 text-[#006300]',
  DISPUTED: 'bg-status-critical/10 text-status-critical',
};

export default async function SettlementsPage() {
  const [settlements, suppliers] = await Promise.all([
    listSettlements(),
    prisma.supplier.findMany({ where: { status: 'ACTIVE' }, select: { id: true, companyName: true }, orderBy: { companyName: 'asc' } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Versements fournisseurs</h1>
        <p className="text-sm text-ink-secondary">{settlements.length} versement{settlements.length > 1 ? 's' : ''}</p>
      </div>

      <Card>
        <CardHeader title="Générer un nouveau versement" />
        <GenerateSettlementForm suppliers={suppliers} />
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Fournisseur</th>
              <th className="pb-2 font-medium">Période</th>
              <th className="pb-2 font-medium">Commandes</th>
              <th className="pb-2 font-medium">Net à verser</th>
              <th className="pb-2 font-medium">Statut</th>
              <th className="pb-2 pr-0 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {settlements.map((s) => (
              <tr key={s.id}>
                <td className="py-2.5">
                  <Link href={`/dashboard/settlements/${s.id}`} className="font-medium text-brand-600 hover:underline">
                    {s.supplier.companyName}
                  </Link>
                </td>
                <td className="py-2.5 text-ink-secondary">
                  {s.periodStart.toLocaleDateString('fr-FR')} – {s.periodEnd.toLocaleDateString('fr-FR')}
                </td>
                <td className="py-2.5 text-ink-secondary">{s.totalOrders}</td>
                <td className="py-2.5 tabular-nums text-ink-primary">{Number(s.netPayout).toLocaleString('fr-FR')} MAD</td>
                <td className="py-2.5">
                  <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', STATUS_CLASSES[s.status])}>
                    {STATUS_LABELS[s.status]}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  <SettlementActions settlementId={s.id} status={s.status} />
                </td>
              </tr>
            ))}
            {settlements.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-ink-muted">
                  Aucun versement généré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
