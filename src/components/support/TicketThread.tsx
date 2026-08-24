'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

interface Message {
  id: string;
  body: string;
  createdAt: Date | string;
  authorId: string;
  author: { firstName: string; lastName: string; role: string };
}

export function TicketThread({ ticketId, messages, currentUserId }: { ticketId: string; messages: Message[]; currentUserId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: body.trim() }),
      });
      setBody('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'envoyer le message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {messages.map((message) => {
          const isMine = message.authorId === currentUserId;
          return (
            <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isMine ? 'bg-brand-600 text-white' : 'border border-hairline bg-surface text-ink-primary'}`}>
                <div className={`mb-0.5 text-xs font-medium ${isMine ? 'text-brand-100' : 'text-ink-muted'}`}>
                  {message.author.firstName} {message.author.lastName}
                </div>
                <div className="whitespace-pre-wrap">{message.body}</div>
                <div className={`mt-1 text-right text-xs ${isMine ? 'text-brand-100' : 'text-ink-muted'}`}>
                  {new Date(message.createdAt).toLocaleTimeString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 rounded-lg border border-hairline bg-surface p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Votre message…"
          rows={3}
          className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        {error && <p className="text-xs text-status-critical">{error}</p>}
        <Button onClick={send} loading={busy} disabled={!body.trim()} className="w-full">
          Envoyer
        </Button>
      </div>
    </div>
  );
}
