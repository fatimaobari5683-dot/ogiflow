'use client';

import { useRouter } from 'next/navigation';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
    >
      🖨️ Imprimer
    </button>
  );
}

/**
 * `router.back()` plutôt qu'un lien fixe : cette page est accessible depuis
 * plusieurs espaces (admin, fournisseur, livreur), sans URL de retour unique.
 */
export function BackButton() {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.back()} className="text-sm text-brand-600 hover:underline">
      ← Retour
    </button>
  );
}
