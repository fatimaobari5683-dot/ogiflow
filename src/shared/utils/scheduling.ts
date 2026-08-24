/**
 * Formate un créneau de livraison programmée ("24 août, 14h00 – 16h00") à
 * partir du début et de la durée en minutes — utilisé partout où une
 * commande programmée doit s'afficher (détail commande, suivi client).
 */
export function formatScheduledWindow(scheduledFor: Date, windowMinutes: number | null): string {
  const start = new Date(scheduledFor);
  const datePart = start.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' });
  const startTime = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (!windowMinutes) {
    return `${datePart}, ${startTime}`;
  }

  const end = new Date(start.getTime() + windowMinutes * 60_000);
  const endTime = end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${datePart}, ${startTime} – ${endTime}`;
}
