'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

interface PendingOffer {
  id: string;
  expiresAt: string;
  order: {
    orderNumber: string;
    deliveryFee: string;
    totalAmount: string;
    paymentMethod: string;
    customer: { fullName: string };
    address: { fullAddress: string; city: string };
  };
}

const POLL_INTERVAL_MS = 8000;

export function PendingOffers({ driverId, commissionRate }: { driverId: string; commissionRate: number }) {
  const router = useRouter();
  const [offers, setOffers] = useState<PendingOffer[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOffers = useCallback(() => {
    apiFetch<PendingOffer[]>(`/api/v1/drivers/${driverId}/offers`)
      .then(setOffers)
      .catch(() => {
        // Échec silencieux sur le polling — pas besoin d'interrompre l'app livreur pour ça.
      });
  }, [driverId]);

  useEffect(() => {
    fetchOffers();
    const interval = setInterval(fetchOffers, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchOffers]);

  async function respond(offerId: string, action: 'accept' | 'reject') {
    setLoadingId(offerId);
    setError(null);
    try {
      await apiFetch(`/api/v1/offers/${offerId}/${action}`, { method: 'POST' });
      setOffers((prev) => prev.filter((o) => o.id !== offerId));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
      fetchOffers(); // resynchronise (l'offre a peut-être expiré entre-temps)
    } finally {
      setLoadingId(null);
    }
  }

  if (offers.length === 0) return null;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-status-critical">{error}</p>}
      {offers.map((offer) => (
        <OfferCard
          key={offer.id}
          offer={offer}
          commissionRate={commissionRate}
          loading={loadingId === offer.id}
          onAccept={() => respond(offer.id, 'accept')}
          onReject={() => respond(offer.id, 'reject')}
        />
      ))}
    </div>
  );
}

function OfferCard({
  offer,
  commissionRate,
  loading,
  onAccept,
  onReject,
}: {
  offer: PendingOffer;
  commissionRate: number;
  loading: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [remainingSeconds, setRemainingSeconds] = useState(() => secondsUntil(offer.expiresAt));

  useEffect(() => {
    const tick = setInterval(() => setRemainingSeconds(secondsUntil(offer.expiresAt)), 1000);
    return () => clearInterval(tick);
  }, [offer.expiresAt]);

  const estimatedGain = Math.round(Number(offer.order.deliveryFee) * (commissionRate / 100) * 100) / 100;

  if (remainingSeconds <= 0) return null;

  return (
    <div className="rounded-lg border-2 border-brand-500 bg-brand-50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">Nouvelle mission</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-brand-700">
          ⏱ {remainingSeconds}s
        </span>
      </div>

      <div className="mt-2 text-sm">
        <div className="text-ink-secondary">📍 Livraison</div>
        <div className="font-medium text-ink-primary">{offer.order.address.fullAddress}</div>
        <div className="text-ink-muted">{offer.order.address.city}</div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-ink-muted">Gain estimé</div>
          <div className="text-lg font-semibold text-ink-primary">{estimatedGain} MAD</div>
        </div>
        {offer.order.paymentMethod === 'CASH_ON_DELIVERY' && (
          <div className="text-right">
            <div className="text-xs text-ink-muted">À encaisser</div>
            <div className="font-medium text-ink-primary">{Number(offer.order.totalAmount).toLocaleString('fr-FR')} MAD</div>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="flex-1" loading={loading} onClick={onReject}>
          Refuser
        </Button>
        <Button className="flex-1" loading={loading} onClick={onAccept}>
          Accepter
        </Button>
      </div>
    </div>
  );
}

function secondsUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
}
