const TIER_LABELS: Record<string, string> = {
  BRONZE: 'Bronze',
  SILVER: 'Argent',
  GOLD: 'Or',
  PLATINUM: 'Platine',
};

const TIER_CLASSES: Record<string, string> = {
  BRONZE: 'bg-[#8a5a3a]/10 text-[#8a5a3a]',
  SILVER: 'bg-slate-200 text-slate-700',
  GOLD: 'bg-[#f5a623]/15 text-[#8a5a00]',
  PLATINUM: 'bg-brand-100 text-brand-700',
};

const TIER_ICONS: Record<string, string> = {
  BRONZE: '🥉',
  SILVER: '🥈',
  GOLD: '🥇',
  PLATINUM: '💎',
};

export function DriverTierBadge({ tier }: { tier: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TIER_CLASSES[tier] ?? 'bg-slate-100 text-ink-muted'}`}>
      <span aria-hidden>{TIER_ICONS[tier] ?? ''}</span>
      {TIER_LABELS[tier] ?? tier}
    </span>
  );
}
