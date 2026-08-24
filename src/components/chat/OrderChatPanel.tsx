'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

interface ChatMessage {
  id: string;
  sender: 'CUSTOMER' | 'DRIVER';
  body: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 8_000;

/**
 * Chat livreur ↔ client pendant la livraison — un seul composant partagé
 * entre la page de suivi public (sender='CUSTOMER') et la mission livreur
 * (sender='DRIVER') : même UI, endpoints différents (voir order-chat.service.ts
 * pour la distinction d'authentification entre les deux).
 */
export function OrderChatPanel({ fetchUrl, sendUrl, myRole }: { fetchUrl: string; sendUrl: string; myRole: 'CUSTOMER' | 'DRIVER' }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(() => {
    apiFetch<ChatMessage[]>(fetchUrl)
      .then(setMessages)
      .catch(() => {}); // le polling silencieux ne doit pas spammer d'erreurs
  }, [fetchUrl]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(sendUrl, { method: 'POST', body: JSON.stringify({ body: body.trim() }) });
      setBody('');
      fetchMessages();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'envoyer le message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface p-3">
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {messages.length === 0 && <p className="py-2 text-center text-xs text-ink-muted">Aucun message pour le moment.</p>}
        {messages.map((message) => {
          const isMine = message.sender === myRole;
          return (
            <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isMine ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-primary'}`}>
                <div className="whitespace-pre-wrap">{message.body}</div>
                <div className={`mt-0.5 text-right text-xs ${isMine ? 'text-brand-100' : 'text-ink-muted'}`}>
                  {new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Votre message…"
          className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <Button onClick={send} loading={busy} disabled={!body.trim()}>
          Envoyer
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-status-critical">{error}</p>}
    </div>
  );
}
