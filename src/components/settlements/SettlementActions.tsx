'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

export function SettlementActions({ settlementId, status }: { settlementId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string, path: string) {
    setLoading(action);
    setError(null);
    try {
      await apiFetch(`/api/v1/settlements/${settlementId}/${path}`, { method: 'POST' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-status-critical">{error}</span>}
      {status === 'DRAFT' && (
        <Button variant="secondary" loading={loading === 'submit'} onClick={() => run('submit', 'submit')}>
          Soumettre au paiement
        </Button>
      )}
      {status === 'PENDING_PAYMENT' && (
        <Button loading={loading === 'confirm'} onClick={() => run('confirm', 'confirm-paid')}>
          Confirmer payé
        </Button>
      )}
      {(status === 'DRAFT' || status === 'PENDING_PAYMENT') && (
        <Button variant="danger" loading={loading === 'dispute'} onClick={() => run('dispute', 'dispute')}>
          Contester
        </Button>
      )}
    </div>
  );
}
