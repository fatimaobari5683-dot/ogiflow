'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';

export function PromoCodeToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/promotions/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !isActive }) });
      router.refresh();
    } catch (err) {
      // Erreur silencieuse volontaire — l'action est un simple bouton, pas
      // un formulaire ; router.refresh() ne se produit pas si ça échoue,
      // ce qui suffit à signaler visuellement que rien n'a changé.
      console.error(err instanceof ApiError ? err.message : err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={
        'rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-50 ' +
        (isActive ? 'bg-[#0ca30c]/10 text-[#006300]' : 'bg-slate-100 text-ink-muted')
      }
    >
      {isActive ? 'Actif' : 'Inactif'}
    </button>
  );
}
