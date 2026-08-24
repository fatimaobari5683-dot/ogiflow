'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

type TransitStatus = 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY';
type FailureResult = 'CUSTOMER_ABSENT' | 'WRONG_ADDRESS' | 'CUSTOMER_REFUSED' | 'OTHER_FAILURE';

const PROOF_TYPES = [
  { value: 'OTP', label: 'Code OTP' },
  { value: 'SIGNATURE', label: 'Signature' },
  { value: 'PHOTO', label: 'Photo' },
  { value: 'GPS', label: 'GPS uniquement' },
] as const;

/** Best-effort : ne bloque jamais une action si la géoloc est refusée/absente. */
function getGeo(): Promise<{ latitude?: number; longitude?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve({}),
      { timeout: 3000 }
    );
  });
}

export function MissionActions({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPodForm, setShowPodForm] = useState(false);
  const [proofType, setProofType] = useState<(typeof PROOF_TYPES)[number]['value']>('OTP');
  const [proofValue, setProofValue] = useState('');
  const [notes, setNotes] = useState('');

  async function advance(toStatus: TransitStatus) {
    setLoading(toStatus);
    setError(null);
    try {
      const geo = await getGeo();
      await apiFetch(`/api/v1/deliveries/orders/${orderId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: toStatus, ...geo }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setLoading(null);
    }
  }

  async function recordFailure(result: FailureResult) {
    setLoading(result);
    setError(null);
    try {
      const geo = await getGeo();
      await apiFetch(`/api/v1/deliveries/orders/${orderId}/attempts`, {
        method: 'POST',
        body: JSON.stringify({ result, notes: notes || undefined, ...geo }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setLoading(null);
    }
  }

  async function confirmDelivered() {
    if (!proofValue.trim()) {
      setError('Renseignez la preuve de livraison avant de confirmer.');
      return;
    }
    setLoading('SUCCESS');
    setError(null);
    try {
      const geo = await getGeo();
      await apiFetch(`/api/v1/deliveries/orders/${orderId}/attempts`, {
        method: 'POST',
        body: JSON.stringify({
          result: 'SUCCESS',
          proof: { type: proofType, data: { value: proofValue } },
          ...geo,
        }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Confirmation impossible.');
    } finally {
      setLoading(null);
    }
  }

  async function retryDelivery() {
    await advance('OUT_FOR_DELIVERY');
  }

  async function resolveAs(toStatus: 'RESCHEDULED' | 'RETURNED') {
    setLoading(toStatus);
    setError(null);
    try {
      await apiFetch(`/api/v1/deliveries/orders/${orderId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ status: toStatus }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
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

      {status === 'ASSIGNED' && (
        <Button className="w-full py-3 text-base" loading={loading === 'PICKED_UP'} onClick={() => advance('PICKED_UP')}>
          Colis récupéré
        </Button>
      )}

      {status === 'PICKED_UP' && (
        <Button className="w-full py-3 text-base" loading={loading === 'IN_TRANSIT'} onClick={() => advance('IN_TRANSIT')}>
          Démarrer le trajet
        </Button>
      )}

      {status === 'IN_TRANSIT' && (
        <Button
          className="w-full py-3 text-base"
          loading={loading === 'OUT_FOR_DELIVERY'}
          onClick={() => advance('OUT_FOR_DELIVERY')}
        >
          Arrivé — en livraison
        </Button>
      )}

      {status === 'OUT_FOR_DELIVERY' && !showPodForm && (
        <div className="space-y-2">
          <Button className="w-full py-3 text-base" onClick={() => setShowPodForm(true)}>
            ✓ Livraison réussie
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              loading={loading === 'CUSTOMER_ABSENT'}
              onClick={() => recordFailure('CUSTOMER_ABSENT')}
            >
              Client absent
            </Button>
            <Button
              variant="secondary"
              loading={loading === 'WRONG_ADDRESS'}
              onClick={() => recordFailure('WRONG_ADDRESS')}
            >
              Adresse erronée
            </Button>
            <Button
              variant="secondary"
              loading={loading === 'CUSTOMER_REFUSED'}
              onClick={() => recordFailure('CUSTOMER_REFUSED')}
            >
              Refusé
            </Button>
            <Button
              variant="secondary"
              loading={loading === 'OTHER_FAILURE'}
              onClick={() => recordFailure('OTHER_FAILURE')}
            >
              Autre problème
            </Button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note (optionnel, jointe à l'issue choisie)"
            className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
            rows={2}
          />
        </div>
      )}

      {status === 'OUT_FOR_DELIVERY' && showPodForm && (
        <div className="space-y-3 rounded-lg border border-hairline bg-surface p-3">
          <div className="text-sm font-medium text-ink-primary">Preuve de livraison</div>
          <div className="flex gap-2">
            {PROOF_TYPES.map((p) => (
              <button
                key={p.value}
                onClick={() => setProofType(p.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  proofType === p.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-secondary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            value={proofValue}
            onChange={(e) => setProofValue(e.target.value)}
            placeholder={proofType === 'OTP' ? 'Code reçu par le client' : 'Référence / note'}
            className="w-full rounded-md border border-hairline px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowPodForm(false)}>
              Annuler
            </Button>
            <Button className="flex-1" loading={loading === 'SUCCESS'} onClick={confirmDelivered}>
              Confirmer la livraison
            </Button>
          </div>
        </div>
      )}

      {['CUSTOMER_ABSENT', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED'].includes(status) && (
        <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 p-3">
          <p className="text-sm text-ink-secondary">Tentative échouée — en attente de décision.</p>
          <div className="mt-2 flex gap-2">
            <Button loading={loading === 'RESCHEDULED'} onClick={() => resolveAs('RESCHEDULED')}>
              Reprogrammer
            </Button>
            <Button variant="danger" loading={loading === 'RETURNED'} onClick={() => resolveAs('RETURNED')}>
              Retourner
            </Button>
          </div>
        </div>
      )}

      {status === 'RESCHEDULED' && (
        <Button className="w-full py-3 text-base" loading={loading === 'OUT_FOR_DELIVERY'} onClick={retryDelivery}>
          Reprendre la livraison
        </Button>
      )}
    </div>
  );
}
