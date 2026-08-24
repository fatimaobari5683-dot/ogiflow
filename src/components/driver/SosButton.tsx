'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';

/**
 * Bouton d'urgence — inspiré du bouton SOS Uber/Lyft/Grab. Une étape de
 * confirmation explicite : un bouton de cette gravité ne doit jamais se
 * déclencher sur un appui accidentel.
 */
export function SosButton({ orderId }: { orderId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/deliveries/orders/${orderId}/sos`, {
        method: 'POST',
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      setSent(true);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'envoyer l'alerte.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-status-critical/40 bg-status-critical/10 p-3 text-center text-sm font-medium text-status-critical">
        🆘 Alerte envoyée — le support a été prévenu.
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg border-2 border-status-critical bg-status-critical/5 py-2.5 text-sm font-semibold text-status-critical"
      >
        🆘 Urgence / SOS
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border-2 border-status-critical bg-status-critical/5 p-3">
      <p className="text-sm font-medium text-status-critical">Confirmer l&apos;envoi d&apos;une alerte d&apos;urgence ?</p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Détail (optionnel)"
        className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-status-critical focus:outline-none focus:ring-1 focus:ring-status-critical"
      />
      {error && <p className="text-xs text-status-critical">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="flex-1 rounded-md bg-status-critical py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Envoi…' : 'Confirmer'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="flex-1 rounded-md border border-hairline py-2 text-sm font-medium text-ink-primary disabled:opacity-50"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
