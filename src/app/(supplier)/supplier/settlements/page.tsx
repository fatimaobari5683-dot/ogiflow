import { requirePageUser } from '@/shared/http/page-auth';
import { prisma } from '@/infrastructure/database/client';
import { listSettlements } from '@/modules/settlements/settlements.service';
import { Card } from '@/components/ui/Card';
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

export default async function SupplierSettlementsPage() {
  const user = await requirePageUser(['SUPPLIER']);
  const supplier = await prisma.supplier.findUniqueOrThrow({ where: { userId: user.id } });
  const settlements = await listSettlements({ supplierId: supplier.id });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Versements</h1>
        <p className="text-sm text-ink-secondary">
          {settlements.length} versement{settlements.length > 1 ? 's' : ''} — générés par l&apos;équipe finance
        </p>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Période</th>
              <th className="pb-2 font-medium">Commandes</th>
              <th className="pb-2 font-medium">Net à recevoir</th>
              <th className="pb-2 pr-0 text-right font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {settlements.map((s) => (
              <tr key={s.id}>
                <td className="py-2.5 text-ink-primary">
                  {s.periodStart.toLocaleDateString('fr-FR')} – {s.periodEnd.toLocaleDateString('fr-FR')}
                </td>
                <td className="py-2.5 text-ink-secondary">{s.totalOrders}</td>
                <td className="py-2.5 tabular-nums font-medium text-ink-primary">
                  {Number(s.netPayout).toLocaleString('fr-FR')} MAD
                </td>
                <td className="py-2.5 text-right">
                  <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium', STATUS_CLASSES[s.status])}>
                    {STATUS_LABELS[s.status]}
                  </span>
                </td>
              </tr>
            ))}
            {settlements.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-ink-muted">
                  Aucun versement pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
