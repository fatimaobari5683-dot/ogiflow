'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

interface DispatchCandidate {
  driverId: string;
  driverCode: string;
  distanceKm: number | null;
  activeLoad: number;
  successRate: number;
  zoneMatch: boolean;
  score: number;
  locationStale: boolean;
}

export function DispatchPanel({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<DispatchCandidate[] | null>(null);
  const [excludedForCompliance, setExcludedForCompliance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [offerSentTo, setOfferSentTo] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ candidates: DispatchCandidate[]; excludedForCompliance: number }>(
      `/api/v1/dispatch/orders/${orderId}/candidates`
    )
      .then((result) => {
        setCandidates(result.candidates);
        setExcludedForCompliance(result.excludedForCompliance);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erreur de chargement.'));
  }, [orderId]);

  async function assign(driverId?: string) {
    setBusyKey(driverId ? `assign-${driverId}` : 'assign-auto');
    setError(null);
    try {
      await apiFetch(`/api/v1/dispatch/orders/${orderId}/assign`, {
        method: 'POST',
        body: JSON.stringify(driverId ? { driverId } : {}),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Assignation impossible.');
    } finally {
      setBusyKey(null);
    }
  }

  async function sendOffer(driverId: string, driverCode: string) {
    setBusyKey(`offer-${driverId}`);
    setError(null);
    try {
      await apiFetch(`/api/v1/dispatch/orders/${orderId}/offer`, {
        method: 'POST',
        body: JSON.stringify({ driverId }),
      });
      setOfferSentTo(driverCode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Envoi de l'offre impossible.");
    } finally {
      setBusyKey(null);
    }
  }

  if (error && !candidates) {
    return <p className="text-sm text-status-critical">{error}</p>;
  }

  if (!candidates) {
    return <p className="text-sm text-ink-muted">Recherche des livreurs disponibles…</p>;
  }

  if (candidates.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-status-warning">Aucun livreur disponible pour le moment.</p>
        {excludedForCompliance > 0 && (
          <p className="text-xs text-ink-muted">
            {excludedForCompliance} livreur{excludedForCompliance > 1 ? 's' : ''} disponible{excludedForCompliance > 1 ? 's' : ''} mais
            exclu{excludedForCompliance > 1 ? 's' : ''} pour documents manquants ou expirés — voir{' '}
            <a href="/dashboard/documents" className="text-brand-600 hover:underline">
              Documents
            </a>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-status-critical">{error}</p>}
      {excludedForCompliance > 0 && (
        <p className="text-xs text-ink-muted">
          {excludedForCompliance} autre{excludedForCompliance > 1 ? 's' : ''} livreur{excludedForCompliance > 1 ? 's' : ''} disponible
          {excludedForCompliance > 1 ? 's' : ''} exclu{excludedForCompliance > 1 ? 's' : ''} pour non-conformité documentaire.
        </p>
      )}
      {offerSentTo && (
        <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">
          Offre envoyée à {offerSentTo} — en attente de réponse (90s). Vous pouvez toujours assigner directement un
          autre livreur si besoin.
        </p>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink-primary">Livreurs recommandés</h3>
        <Button loading={busyKey === 'assign-auto'} onClick={() => assign()}>
          Assigner automatiquement
        </Button>
      </div>
      <ul className="divide-y divide-hairline rounded-md border border-hairline">
        {candidates.map((c, index) => (
          <li key={c.driverId} className="flex items-center justify-between px-3 py-2">
            <div>
              <span className="font-medium text-ink-primary">{c.driverCode}</span>
              {index === 0 && (
                <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                  recommandé
                </span>
              )}
              <div className="text-xs text-ink-muted">
                {c.distanceKm !== null ? `${c.distanceKm.toFixed(2)} km` : 'distance inconnue'} · charge {c.activeLoad} ·
                réussite {(c.successRate * 100).toFixed(0)}% · score {c.score.toFixed(1)}/100
              </div>
              {c.locationStale && (
                <div className="mt-0.5 text-xs text-status-warning">
                  ⚠ position non actualisée depuis 20+ min — distance/ETA potentiellement imprécis
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                loading={busyKey === `offer-${c.driverId}`}
                onClick={() => sendOffer(c.driverId, c.driverCode)}
              >
                Proposer
              </Button>
              <Button loading={busyKey === `assign-${c.driverId}`} onClick={() => assign(c.driverId)}>
                Assigner
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
