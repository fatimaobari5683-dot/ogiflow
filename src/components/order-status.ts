export type OrderStatusValue =
  | 'PENDING'
  | 'CONFIRMED'
  | 'READY_FOR_PICKUP'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CUSTOMER_ABSENT'
  | 'WRONG_ADDRESS'
  | 'CUSTOMER_REFUSED'
  | 'RESCHEDULED'
  | 'RETURNED'
  | 'CANCELLED';

type StatusTone = 'neutral' | 'good' | 'warning' | 'critical';

interface StatusMeta {
  label: string;
  tone: StatusTone;
  symbol: string;
}

/**
 * Une couleur de statut ne porte jamais le sens seule (règle icon + label de
 * la skill dataviz) : chaque tuile associe un symbole ET un libellé texte.
 */
export const ORDER_STATUS_META: Record<OrderStatusValue, StatusMeta> = {
  PENDING: { label: 'En attente', tone: 'neutral', symbol: '○' },
  CONFIRMED: { label: 'Confirmée', tone: 'neutral', symbol: '○' },
  READY_FOR_PICKUP: { label: 'Prête', tone: 'neutral', symbol: '○' },
  ASSIGNED: { label: 'Assignée', tone: 'neutral', symbol: '→' },
  PICKED_UP: { label: 'Récupérée', tone: 'neutral', symbol: '→' },
  IN_TRANSIT: { label: 'En transit', tone: 'neutral', symbol: '→' },
  OUT_FOR_DELIVERY: { label: 'En livraison', tone: 'neutral', symbol: '→' },
  DELIVERED: { label: 'Livrée', tone: 'good', symbol: '✓' },
  CUSTOMER_ABSENT: { label: 'Client absent', tone: 'warning', symbol: '⚠' },
  WRONG_ADDRESS: { label: 'Adresse erronée', tone: 'warning', symbol: '⚠' },
  CUSTOMER_REFUSED: { label: 'Refusée', tone: 'warning', symbol: '⚠' },
  RESCHEDULED: { label: 'Reprogrammée', tone: 'warning', symbol: '↻' },
  RETURNED: { label: 'Retournée', tone: 'critical', symbol: '↻' },
  CANCELLED: { label: 'Annulée', tone: 'critical', symbol: '✕' },
};

export const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-slate-100 text-ink-secondary',
  good: 'bg-[#0ca30c]/10 text-[#006300]',
  warning: 'bg-status-warning/15 text-[#8a5a00]',
  critical: 'bg-status-critical/10 text-status-critical',
};
