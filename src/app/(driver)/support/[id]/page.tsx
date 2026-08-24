import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/shared/http/page-auth';
import { getTicketDetail, SupportError } from '@/modules/support/support.service';
import { TicketThread } from '@/components/support/TicketThread';
import { TICKET_STATUS_LABELS, TICKET_STATUS_CLASSES } from '@/components/support/ticket-labels';

export const dynamic = 'force-dynamic';

export default async function DriverTicketPage({ params }: { params: { id: string } }) {
  const user = await requirePageUser(['DRIVER']);
  const ticket = await getTicketDetail(params.id).catch((err) => {
    if (err instanceof SupportError) return null;
    throw err;
  });
  if (!ticket) notFound();
  if (ticket.createdById !== user.id) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/support" className="text-sm text-brand-600 hover:underline">
          ← Aide
        </Link>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-ink-primary">{ticket.subject}</h1>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TICKET_STATUS_CLASSES[ticket.status] ?? ''}`}>
            {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-3 text-sm text-ink-secondary">{ticket.description}</div>

      <TicketThread ticketId={ticket.id} currentUserId={user.id} messages={ticket.messages} />
    </div>
  );
}
