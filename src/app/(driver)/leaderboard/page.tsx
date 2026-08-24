import Link from 'next/link';
import clsx from 'clsx';
import { requirePageUser } from '@/shared/http/page-auth';
import { getDriverByUserId, getDriverLeaderboard } from '@/modules/drivers/drivers.service';
import { DriverTierBadge } from '@/components/drivers/DriverTierBadge';

export const dynamic = 'force-dynamic';

const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default async function DriverLeaderboardPage({ searchParams }: { searchParams: { period?: string } }) {
  const user = await requirePageUser(['DRIVER']);
  const driver = await getDriverByUserId(user.id);
  if (!driver) return null;

  const period = searchParams.period === 'MONTH' ? 'MONTH' : 'WEEK';
  const entries = await getDriverLeaderboard(period);
  const myEntry = entries.find((e) => e.driverId === driver.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Classement</h1>
        <p className="text-sm text-ink-secondary">Livraisons réussies {period === 'WEEK' ? 'cette semaine' : 'ce mois-ci'}.</p>
      </div>

      <div className="flex gap-2">
        <Link
          href="/leaderboard?period=WEEK"
          className={clsx('flex-1 rounded-md py-2 text-center text-sm font-medium', period === 'WEEK' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-secondary')}
        >
          Cette semaine
        </Link>
        <Link
          href="/leaderboard?period=MONTH"
          className={clsx('flex-1 rounded-md py-2 text-center text-sm font-medium', period === 'MONTH' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-secondary')}
        >
          Ce mois
        </Link>
      </div>

      {myEntry && myEntry.rank > 10 && (
        <div className="rounded-lg border-2 border-brand-500 bg-brand-50 p-3 text-sm">
          <span className="font-semibold text-brand-700">Votre position : #{myEntry.rank}</span>
          <span className="ml-2 text-ink-secondary">
            {myEntry.deliveries} livraison{myEntry.deliveries !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="rounded-lg border border-hairline bg-surface p-4">
        {entries.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucune livraison enregistrée sur cette période pour l&apos;instant.</p>
        ) : (
          <ol className="space-y-2">
            {entries.slice(0, 20).map((entry) => {
              const isMe = entry.driverId === driver.id;
              return (
                <li
                  key={entry.driverId}
                  className={clsx(
                    'flex items-center justify-between rounded-md px-2 py-2 text-sm',
                    isMe && 'border-2 border-brand-500 bg-brand-50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-semibold text-ink-muted">{RANK_MEDALS[entry.rank] ?? entry.rank}</span>
                    <div>
                      <div className={clsx('font-medium', isMe ? 'text-brand-700' : 'text-ink-primary')}>
                        {entry.firstName} {entry.lastNameInitial} {isMe && '(vous)'}
                      </div>
                      <div className="text-xs text-ink-muted">
                        {entry.city ?? '—'} · <DriverTierBadge tier={entry.tier} />
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-ink-primary">{entry.deliveries}</div>
                    {entry.averageRating !== null && (
                      <div className="text-xs text-ink-muted">⭐ {entry.averageRating.toFixed(1)}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
