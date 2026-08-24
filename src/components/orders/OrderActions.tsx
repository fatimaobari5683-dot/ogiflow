'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';
import { DispatchPanel } from './DispatchPanel';

export function OrderActions({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function transition(action: string, body: Record<string, unknown>) {
    setLoading(action);
    setError(null);
    try {
      await apiFetch(`/api/v1/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify(body) });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}

      {status === 'PENDING' && (
        <div className="flex gap-2">
          <Button loading={loading === 'confirm'} onClick={() => transition('confirm', { status: 'CONFIRMED' })}>
            Confirmer la commande
          </Button>
          <Button
            variant="danger"
            loading={loading === 'cancel'}
            onClick={() => transition('cancel', { status: 'CANCELLED' })}
          >
            Annuler
          </Button>
        </div>
      )}

      {status === 'CONFIRMED' && (
        <div className="flex gap-2">
          <Button loading={loading === 'ready'} onClick={() => transition('ready', { status: 'READY_FOR_PICKUP' })}>
            Marquer prête pour ramassage
          </Button>
          <Button
            variant="danger"
            loading={loading === 'cancel'}
            onClick={() => transition('cancel', { status: 'CANCELLED' })}
          >
            Annuler
          </Button>
        </div>
      )}

      {status === 'READY_FOR_PICKUP' && <DispatchPanel orderId={orderId} />}

      {['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(status) && (
        <p className="text-sm text-ink-secondary">
          Livraison en cours — le livreur met à jour le statut depuis son application.
        </p>
      )}

      {['DELIVERED', 'RETURNED', 'CANCELLED', 'CUSTOMER_ABSENT', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED', 'RESCHEDULED'].includes(
        status
      ) && <p className="text-sm text-ink-muted">Aucune action manager disponible pour ce statut.</p>}
    </div>
  );
}
