import { requirePageUser } from '@/shared/http/page-auth';
import { getDriverByUserId } from '@/modules/drivers/drivers.service';
import { getDriverReferralOverview } from '@/modules/drivers/referrals.service';
import { ReferralCodeCard } from '@/components/drivers/ReferralCodeCard';

export const dynamic = 'force-dynamic';

export default async function DriverReferralsPage() {
  const user = await requirePageUser(['DRIVER']);
  const driver = await getDriverByUserId(user.id);
  if (!driver) return null;

  const overview = await getDriverReferralOverview(driver.id);
  const rewardedCount = overview.referrals.filter((r) => r.rewarded).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Parrainage</h1>
        <p className="text-sm text-ink-secondary">
          Parrainez un livreur : {overview.referrerBonus} MAD pour vous, {overview.refereeBonus} MAD pour lui, dès
          que ses {overview.milestone} premières livraisons sont terminées.
        </p>
      </div>

      <ReferralCodeCard code={overview.referralCode} />

      {overview.referredBy && (
        <div className="rounded-lg border border-hairline bg-surface p-3 text-sm text-ink-secondary">
          Vous avez été parrainé par <span className="font-medium text-ink-primary">{overview.referredBy.fullName}</span> ({overview.referredBy.driverCode}).
        </div>
      )}

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Vos filleuls</h2>
          <span className="text-xs text-ink-muted">
            {rewardedCount} récompensé{rewardedCount !== 1 ? 's' : ''} / {overview.referrals.length}
          </span>
        </div>

        {overview.referrals.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Aucun filleul pour l&apos;instant — partagez votre code pour commencer.
          </p>
        ) : (
          <ul className="space-y-3">
            {overview.referrals.map((r) => (
              <li key={r.driverId} className="flex items-center justify-between border-b border-hairline pb-2 text-sm last:border-0 last:pb-0">
                <div>
                  <div className="text-ink-primary">{r.fullName}</div>
                  <div className="text-xs text-ink-muted">{r.driverCode}</div>
                </div>
                <div className="text-right">
                  {r.rewarded ? (
                    <span className="text-xs font-medium text-status-good">✓ Récompensé</span>
                  ) : (
                    <span className="text-xs text-ink-muted">
                      {r.successfulDeliveries} / {overview.milestone} livraisons
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
