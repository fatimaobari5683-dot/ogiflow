import Link from 'next/link';
import { TICKET_STATUS_LABELS, TICKET_STATUS_CLASSES } from './ticket-labels';

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  updatedAt: Date | string;
  createdBy: { firstName: string; lastName: string; role: string };
  assignedTo: { firstName: string; lastName: string } | null;
  relatedOrder: { orderNumber: string } | null;
}

export function TicketListView({
  tickets,
  basePath,
  showRequester = false,
}: {
  tickets: TicketRow[];
  basePath: string;
  showRequester?: boolean;
}) {
  if (tickets.length === 0) {
    return <p className="rounded-lg border border-hairline bg-surface p-6 text-center text-sm text-ink-muted">Aucune demande pour le moment.</p>;
  }

  return (
    <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <Link href={`${basePath}/${ticket.id}`} className="block p-4 hover:bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-ink-primary">{ticket.subject}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TICKET_STATUS_CLASSES[ticket.status] ?? ''}`}>
                {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
              </span>
            </div>
            <div className="mt-1 text-xs text-ink-muted">
              {showRequester && (
                <>
                  {ticket.createdBy.firstName} {ticket.createdBy.lastName} ({ticket.createdBy.role}) ·{' '}
                </>
              )}
              {ticket.relatedOrder && <>{ticket.relatedOrder.orderNumber} · </>}
              {ticket.assignedTo ? `Assigné à ${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}` : 'Non assigné'} ·{' '}
              {new Date(ticket.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
