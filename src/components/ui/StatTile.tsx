import clsx from 'clsx';

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('fr-FR').format(value);
}

interface StatTileProps {
  label: string;
  value: number;
  unit?: string;
  deltaPercent?: number | null;
  deltaLabel?: string;
}

/**
 * Contrat stat-tile (skill dataviz) : label en casse phrase, valeur en
 * chiffres proportionnels (jamais tabular-nums à cette taille), delta signé
 * coloré selon le sens réel (une hausse n'est pas toujours "bonne").
 */
export function StatTile({ label, value, unit, deltaPercent, deltaLabel }: StatTileProps) {
  const hasDelta = deltaPercent !== undefined && deltaPercent !== null;
  const isPositive = hasDelta && deltaPercent! >= 0;

  return (
    <div>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-ink-primary">
        {formatCompact(value)}
        {unit && <span className="ml-1 text-lg font-normal text-ink-secondary">{unit}</span>}
      </div>
      {hasDelta && (
        <div
          className={clsx(
            'mt-1 text-xs font-medium',
            isPositive ? 'text-[#006300]' : 'text-status-critical'
          )}
        >
          {isPositive ? '↗' : '↘'} {Math.abs(deltaPercent!).toFixed(1)}%{' '}
          <span className="font-normal text-ink-muted">{deltaLabel}</span>
        </div>
      )}
    </div>
  );
}
