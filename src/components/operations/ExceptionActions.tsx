'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

export function ExceptionActions({ exceptionId, status }: { exceptionId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolution, setResolution] = useState('');

  async function acknowledge() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/exceptions/${exceptionId}/acknowledge`, { method: 'POST' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (resolution.trim().length < 3) {
      setError('Décrivez la résolution (3 caractères minimum).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/exceptions/${exceptionId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution: resolution.trim() }),
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
      {!showResolveForm ? (
        <div className="flex gap-2">
          {status === 'OPEN' && (
            <Button variant="secondary" loading={busy} onClick={acknowledge}>
              Prendre en charge
            </Button>
          )}
          <Button loading={busy} onClick={() => setShowResolveForm(true)}>
            Résoudre
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="Décrire la résolution…"
            className="w-64 rounded-md border border-hairline px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <Button loading={busy} onClick={resolve}>
            Confirmer
          </Button>
          <Button variant="secondary" onClick={() => setShowResolveForm(false)}>
            Annuler
          </Button>
        </div>
      )}
    </div>
  );
}
