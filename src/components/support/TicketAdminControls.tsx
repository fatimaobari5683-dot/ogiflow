'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { TICKET_STATUS_LABELS } from './ticket-labels';

interface Agent {
  id: string;
  firstName: string;
  lastName: string;
}

export function TicketAdminControls({
  ticketId,
  status,
  assignedToId,
  agents,
}: {
  ticketId: string;
  status: string;
  assignedToId: string | null;
  agents: Agent[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/support/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify(body) });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-surface p-3 text-sm">
      <div>
        <label className="mr-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Statut</label>
        <select
          value={status}
          disabled={busy}
          onChange={(e) => update({ status: e.target.value })}
          className="rounded-md border border-hairline px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mr-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Assigné à</label>
        <select
          value={assignedToId ?? ''}
          disabled={busy}
          onChange={(e) => e.target.value && update({ assignedToId: e.target.value })}
          className="rounded-md border border-hairline px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="" disabled>
            Non assigné
          </option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.firstName} {agent.lastName}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-status-critical">{error}</p>}
    </div>
  );
}
