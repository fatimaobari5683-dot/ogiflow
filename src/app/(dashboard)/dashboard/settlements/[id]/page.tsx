import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSettlementDetail } from '@/modules/settlements/settlements.service';
import { Card, CardHeader } from '@/components/ui/Card';
import { SettlementActions } from '@/components/settlements/SettlementActions';

export const dynamic = 'force-dynamic';

export default async function SettlementDetailPage({ params }: { params: { id: string } }) {
  const settlement = await getSettlementDetail(params.id).catch(() => null);
  if (!settlement) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/settlements" className="text-sm text-brand-600 hover:underline">
          ← Versements
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-ink-primary">{settlement.supplier.companyName}</h1>
            <Link href={`/settlements/${settlement.id}/statement`} className="text-sm text-brand-600 hover:underline">
              🖨️ État de versement
            </Link>
          </div>
          <SettlementActions settlementId={settlement.id} status={settlement.status} />
        </div>
        <p className="text-sm text-ink-secondary">
          Période du {settlement.periodStart.toLocaleDateString('fr-FR')} au {settlement.periodEnd.toLocaleDateString('fr-FR')}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <div className="text-xs text-ink-muted">Commandes</div>
          <div className="mt-1 text-2xl font-semibold text-ink-primary">{settlement.totalOrders}</div>
        </Card>
        <Card>
          <div className="text-xs text-ink-muted">Montant brut</div>
          <div className="mt-1 text-2xl font-semibold text-ink-primary">{Number(settlement.grossAmount).toLocaleString('fr-FR')} MAD</div>
        </Card>
        <Card>
          <div className="text-xs text-ink-muted">Commission plateforme</div>
          <div className="mt-1 text-2xl font-semibold text-ink-primary">{Number(settlement.totalCommission).toLocaleString('fr-FR')} MAD</div>
        </Card>
        <Card>
          <div className="text-xs text-ink-muted">Net à verser</div>
          <div className="mt-1 text-2xl font-semibold text-brand-700">{Number(settlement.netPayout).toLocaleString('fr-FR')} MAD</div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Transactions" />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted">
              <th className="pb-2 font-medium">Référence</th>
              <th className="pb-2 font-medium">Type</th>
              <th className="pb-2 font-medium">Statut</th>
              <th className="pb-2 pr-0 text-right font-medium">Montant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {settlement.transactions.map((tx) => (
              <tr key={tx.id}>
                <td className="py-2 font-mono text-xs text-ink-secondary">{tx.reference}</td>
                <td className="py-2">{tx.type}</td>
                <td className="py-2 text-ink-secondary">{tx.status}</td>
                <td className="py-2 text-right tabular-nums">{Number(tx.amount).toLocaleString('fr-FR')} MAD</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
