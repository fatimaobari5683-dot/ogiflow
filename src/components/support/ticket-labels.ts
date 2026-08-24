export const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

export const TICKET_STATUS_TONE: Record<string, 'critical' | 'warning' | 'success' | 'muted'> = {
  OPEN: 'critical',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'muted',
};

export const TICKET_STATUS_CLASSES: Record<string, string> = {
  OPEN: 'bg-status-critical/10 text-status-critical',
  IN_PROGRESS: 'bg-status-warning/15 text-[#8a5a00]',
  RESOLVED: 'bg-[#0ca30c]/10 text-[#006300]',
  CLOSED: 'bg-slate-100 text-ink-muted',
};
