import Link from 'next/link';
import { listAllTickets } from '@/modules/support/support.service';
import { TicketListView } from '@/components/support/TicketListView';
import { TICKET_STATUS_LABELS } from '@/components/support/ticket-labels';
import clsx from 'clsx';
import type { TicketStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default async function SupportQueuePage({ searchParams }: { searchParams: { status?: string } }) {
  const status = STATUSES.includes(searchParams.status as TicketStatus) ? (searchParams.status as TicketStatus) : undefined;
  const tickets = await listAllTickets({ status });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Support</h1>
        <p className="text-sm text-ink-secondary">{tickets.length} demande{tickets.length > 1 ? 's' : ''}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip href="/dashboard/support" label="Toutes" active={!status} />
        {STATUSES.map((s) => (
          <FilterChip key={s} href={`/dashboard/support?status=${s}`} label={TICKET_STATUS_LABELS[s]!} active={status === s} />
        ))}
      </div>

      <TicketListView tickets={tickets} basePath="/dashboard/support" showRequester />
    </div>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={clsx(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        active ? 'bg-brand-600 text-white' : 'border border-hairline text-ink-secondary hover:border-brand-300'
      )}
    >
      {label}
    </Link>
  );
}
