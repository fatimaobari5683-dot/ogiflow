import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/shared/http/page-auth';
import { getTicketDetail, listSupportAgents, SupportError } from '@/modules/support/support.service';
import { TicketThread } from '@/components/support/TicketThread';
import { TicketAdminControls } from '@/components/support/TicketAdminControls';
import { TICKET_STATUS_LABELS, TICKET_STATUS_CLASSES } from '@/components/support/ticket-labels';

export const dynamic = 'force-dynamic';

export default async function AdminTicketPage({ params }: { params: { id: string } }) {
  const user = await requirePageUser(['SUPER_ADMIN', 'LOGISTICS_MANAGER', 'FINANCE_MANAGER', 'SUPPORT_AGENT']);

  const ticket = await getTicketDetail(params.id).catch((err) => {
    if (err instanceof SupportError) return null;
    throw err;
  });
  if (!ticket) notFound();

  const agents = await listSupportAgents();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/support" className="text-sm text-brand-600 hover:underline">
          ← Support
        </Link>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-ink-primary">{ticket.subject}</h1>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TICKET_STATUS_CLASSES[ticket.status] ?? ''}`}>
            {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-secondary">
          {ticket.createdBy.firstName} {ticket.createdBy.lastName} ({ticket.createdBy.role})
          {ticket.relatedOrder && <> · {ticket.relatedOrder.orderNumber}</>}
        </p>
      </div>

      <TicketAdminControls ticketId={ticket.id} status={ticket.status} assignedToId={ticket.assignedToId} agents={agents} />

      <div className="rounded-lg border border-hairline bg-surface p-3 text-sm text-ink-secondary">{ticket.description}</div>

      <TicketThread ticketId={ticket.id} currentUserId={user.id} messages={ticket.messages} />
    </div>
  );
}
