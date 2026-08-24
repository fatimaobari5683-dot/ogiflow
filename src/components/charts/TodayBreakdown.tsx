interface Row {
  label: string;
  value: number;
  symbol: string;
  barClass: string;
}

/**
 * Quatre catégories seulement : des barres proportionnelles maison lisent
 * mieux qu'un donut ici (comparaison directe de magnitudes, pas de part d'un
 * tout). Icône + libellé sur chaque ligne — jamais la couleur seule.
 */
export function TodayBreakdown({
  delivered,
  inProgress,
  problems,
  returned,
}: {
  delivered: number;
  inProgress: number;
  problems: number;
  returned: number;
}) {
  const rows: Row[] = [
    { label: 'Livrées', value: delivered, symbol: '✓', barClass: 'bg-[#0ca30c]' },
    { label: 'En cours', value: inProgress, symbol: '→', barClass: 'bg-brand-500' },
    { label: 'Problèmes', value: problems, symbol: '⚠', barClass: 'bg-status-warning' },
    { label: 'Retours', value: returned, symbol: '↻', barClass: 'bg-status-critical' },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <div className="flex w-24 items-center gap-1.5 text-sm text-ink-secondary">
            <span aria-hidden>{row.symbol}</span>
            {row.label}
          </div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${row.barClass}`}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
          <div className="w-10 text-right text-sm font-medium tabular-nums text-ink-primary">{row.value}</div>
        </div>
      ))}
    </div>
  );
}
