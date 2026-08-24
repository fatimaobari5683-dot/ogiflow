import { requirePageUser } from '@/shared/http/page-auth';
import { getDriverByUserId, getDriverPerformance } from '@/modules/drivers/drivers.service';
import { getDriverEarningsSummary, listDriverTransactions } from '@/modules/payments/payments.service';
import { DriverTierBadge } from '@/components/drivers/DriverTierBadge';

export const dynamic = 'force-dynamic';

const TRANSACTION_LABELS: Record<string, string> = {
  COD_COLLECTION: 'Encaissement client',
  DRIVER_PAYOUT: 'Votre rémunération',
  REFERRAL_BONUS: 'Prime de parrainage',
  REFUND: 'Remboursement',
  ADJUSTMENT: 'Ajustement',
};

// Sens du mouvement du point de vue du livreur — un encaissement COD est de
// l'argent qu'il détient physiquement (dû à la société), pas un gain ; seule
// la rémunération lui appartient réellement. Les afficher différemment évite
// de laisser croire que tout mouvement listé est un gain.
const IS_EARNING: Record<string, boolean> = {
  DRIVER_PAYOUT: true,
  REFERRAL_BONUS: true,
  ADJUSTMENT: true,
  REFUND: false,
  COD_COLLECTION: false,
};

export default async function DriverEarningsPage() {
  const user = await requirePageUser(['DRIVER']);
  const driver = await getDriverByUserId(user.id);
  if (!driver) return null;

  const [summary, transactions, performance] = await Promise.all([
    getDriverEarningsSummary(driver.id),
    listDriverTransactions(driver.id),
    getDriverPerformance(driver.id),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-ink-primary">Mes gains</h1>
          <DriverTierBadge tier={performance.tier} />
        </div>
        <p className="text-sm text-ink-secondary">Solde et historique de vos rémunérations.</p>
      </div>

      <div className="rounded-lg border-2 border-brand-500 bg-brand-50 p-4 text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-brand-700">Solde à percevoir</div>
        <div className="mt-1 text-3xl font-semibold text-brand-700">
          {summary.walletBalance.toLocaleString('fr-FR')} <span className="text-lg">MAD</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Aujourd'hui" value={summary.payoutToday} />
        <StatTile label="Cette semaine" value={summary.payoutThisWeek} />
        <StatTile label="Ce mois" value={summary.payoutThisMonth} />
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-3 text-center text-sm">
        <span className="font-semibold text-ink-primary">{summary.deliveredToday}</span>{' '}
        <span className="text-ink-secondary">livraison{summary.deliveredToday !== 1 ? 's' : ''} terminée{summary.deliveredToday !== 1 ? 's' : ''} aujourd&apos;hui</span>
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">Historique</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun mouvement pour le moment.</p>
        ) : (
          <ul className="space-y-3">
            {transactions.map((tx) => {
              const isEarning = IS_EARNING[tx.type] ?? false;
              return (
                <li key={tx.id} className="flex items-center justify-between border-b border-hairline pb-2 text-sm last:border-0 last:pb-0">
                  <div>
                    <div className="text-ink-primary">{TRANSACTION_LABELS[tx.type] ?? tx.type}</div>
                    <div className="text-xs text-ink-muted">
                      {tx.order?.orderNumber ?? '—'} ·{' '}
                      {new Date(tx.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className={isEarning ? 'font-medium text-[#0ca30c]' : 'font-medium text-ink-secondary'}>
                    {isEarning ? '+' : ''}
                    {Number(tx.amount).toLocaleString('fr-FR')} MAD
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-3 text-center">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink-primary">{value.toLocaleString('fr-FR')}</div>
    </div>
  );
}
