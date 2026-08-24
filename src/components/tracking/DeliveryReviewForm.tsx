'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

export function DeliveryReviewForm({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (rating < 1) {
      setError('Sélectionnez une note.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/tracking/${encodeURIComponent(orderNumber)}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer votre avis.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4">
      <div className="text-sm font-medium text-ink-primary">Comment s&apos;est passée votre livraison ?</div>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Note sur 5">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} étoile${value > 1 ? 's' : ''}`}
            disabled={busy}
            onClick={() => setRating(value)}
            onMouseEnter={() => setHoverRating(value)}
            onMouseLeave={() => setHoverRating(0)}
            className="text-2xl leading-none disabled:opacity-50"
          >
            <span className={value <= (hoverRating || rating) ? 'text-[#f5a623]' : 'text-slate-200'}>★</span>
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Un commentaire (optionnel)"
        maxLength={500}
        rows={2}
        disabled={busy}
        className="mt-3 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />

      {error && <p className="mt-2 text-xs text-status-critical">{error}</p>}

      <Button type="button" onClick={submit} loading={busy} className="mt-3 w-full">
        Envoyer mon avis
      </Button>
    </div>
  );
}
