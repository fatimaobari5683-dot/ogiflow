'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';
import { DOCUMENT_REJECTION_REASON_LABELS } from '@/components/documents/document-labels';

export function DocumentReviewActions({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reasonCode, setReasonCode] = useState('ILLEGIBLE');
  const [reason, setReason] = useState('');

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/documents/${documentId}/verify`, { method: 'POST' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (reason.trim().length < 3) {
      setError('Décrivez le motif de refus (3 caractères minimum).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/documents/${documentId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reasonCode, reason: reason.trim() }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-status-critical">{error}</p>}
      {!showRejectForm ? (
        <div className="flex gap-2">
          <Button variant="secondary" loading={busy} onClick={() => setShowRejectForm(true)}>
            Refuser
          </Button>
          <Button loading={busy} onClick={verify}>
            Vérifier
          </Button>
        </div>
      ) : (
        <div className="w-64 space-y-2">
          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="w-full rounded-md border border-hairline px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {Object.entries(DOCUMENT_REJECTION_REASON_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Détail (ex: numéro non lisible)…"
            className="w-full rounded-md border border-hairline px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <div className="flex gap-2">
            <Button variant="danger" loading={busy} onClick={reject}>
              Confirmer
            </Button>
            <Button variant="secondary" onClick={() => setShowRejectForm(false)}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
