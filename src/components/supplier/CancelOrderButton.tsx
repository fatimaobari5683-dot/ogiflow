'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!confirm('Annuler cette commande ?')) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Annulation impossible.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button variant="danger" loading={loading} onClick={cancel}>
        Annuler la commande
      </Button>
      {error && <p className="mt-2 text-sm text-status-critical">{error}</p>}
    </div>
  );
}
