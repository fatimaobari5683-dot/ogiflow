'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

export function OnboardingActions({ type, id }: { type: 'supplier' | 'driver'; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState('');

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/onboarding/${type}s/${id}/approve`, { method: 'POST' });
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
      await apiFetch(`/api/v1/onboarding/${type}s/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
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
          <Button loading={busy} onClick={approve}>
            Approuver
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motif du refus…"
            className="w-56 rounded-md border border-hairline px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <Button variant="danger" loading={busy} onClick={reject}>
            Confirmer le refus
          </Button>
          <Button variant="secondary" onClick={() => setShowRejectForm(false)}>
            Annuler
          </Button>
        </div>
      )}
    </div>
  );
}
