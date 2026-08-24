interface SettlementLine {
  id: string;
  reference: string;
  amount: unknown;
  order: { orderNumber: string; createdAt: Date; totalAmount: unknown; commissionAmount: unknown; customer: { fullName: string } } | null;
}

interface SettlementStatementData {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  totalOrders: number;
  grossAmount: unknown;
  totalCommission: unknown;
  netPayout: unknown;
  status: string;
  paidAt: Date | null;
  supplier: { companyName: string; taxId: string | null; billingAddress: string | null } | null;
  transactions: SettlementLine[];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  PENDING_PAYMENT: 'En attente de paiement',
  PAID: 'Payé',
  DISPUTED: 'Contesté',
};

/**
 * État de versement — document LogiFlow au fournisseur (le sens inverse de
 * la facture, OrderInvoice.tsx : ici ce que LogiFlow lui doit après
 * commission, pas ce que le client a payé). Même style visuel que les
 * autres documents imprimables de la plateforme.
 */
export function SettlementStatement({ settlement }: { settlement: SettlementStatementData }) {
  return (
    <div className="mx-auto w-full max-w-lg border-2 border-ink-primary bg-white p-6 text-ink-primary print:border-black print:text-black">
      <div className="flex items-start justify-between border-b-2 border-ink-primary pb-3 print:border-black">
        <div>
          <div className="text-lg font-bold">LogiFlow</div>
          <div className="text-xs uppercase tracking-wide text-ink-muted print:text-black">État de versement</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-ink-muted print:text-black">Statut</div>
          <div className="text-sm font-bold">{STATUS_LABELS[settlement.status] ?? settlement.status}</div>
          {settlement.paidAt && (
            <div className="text-xs text-ink-muted print:text-black">
              versé le {new Date(settlement.paidAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-b border-hairline pb-3 text-sm print:border-black">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted print:text-black">Fournisseur</div>
          <div className="mt-1 font-medium">{settlement.supplier?.companyName ?? '—'}</div>
          {settlement.supplier?.billingAddress && <div>{settlement.supplier.billingAddress}</div>}
          {settlement.supplier?.taxId && <div>IF/ICE : {settlement.supplier.taxId}</div>}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted print:text-black">Période couverte</div>
          <div className="mt-1">
            {new Date(settlement.periodStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })} –{' '}
            {new Date(settlement.periodEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
          <div>{settlement.totalOrders} commande{settlement.totalOrders > 1 ? 's' : ''}</div>
        </div>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs uppercase text-ink-muted print:border-black print:text-black">
            <th className="pb-2 font-medium">Commande</th>
            <th className="pb-2 font-medium">Client</th>
            <th className="pb-2 text-right font-medium">Montant</th>
            <th className="pb-2 text-right font-medium">Commission</th>
            <th className="pb-2 pr-0 text-right font-medium">Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {settlement.transactions.map((tx) => {
            const gross = tx.order ? Number(tx.order.totalAmount) : null;
            const commission = tx.order ? Number(tx.order.commissionAmount) : null;
            return (
              <tr key={tx.id}>
                <td className="py-1.5">{tx.order?.orderNumber ?? '—'}</td>
                <td className="py-1.5">{tx.order?.customer.fullName ?? '—'}</td>
                <td className="py-1.5 text-right">{gross !== null ? gross.toLocaleString('fr-FR') : '—'} MAD</td>
                <td className="py-1.5 text-right">{commission !== null ? commission.toLocaleString('fr-FR') : '—'} MAD</td>
                <td className="py-1.5 pr-0 text-right">{Number(tx.amount).toLocaleString('fr-FR')} MAD</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-3 space-y-1 border-t border-hairline pt-3 text-sm print:border-black">
        <div className="flex justify-between">
          <span className="text-ink-muted print:text-black">Montant brut</span>
          <span>{Number(settlement.grossAmount).toLocaleString('fr-FR')} MAD</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted print:text-black">Commission plateforme</span>
          <span>−{Number(settlement.totalCommission).toLocaleString('fr-FR')} MAD</span>
        </div>
        <div className="flex justify-between border-t border-hairline pt-1.5 text-base font-bold print:border-black">
          <span>Net à verser</span>
          <span>{Number(settlement.netPayout).toLocaleString('fr-FR')} MAD</span>
        </div>
      </div>
    </div>
  );
}
