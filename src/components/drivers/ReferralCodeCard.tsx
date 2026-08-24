'use client';

import { useState } from 'react';

/**
 * Carte "code de parrainage" — copie le code et un lien d'inscription
 * pré-rempli (`?ref=CODE`, lu par RegisterForm) en un clic. `code` est null
 * tant que assignReferralCode n'a jamais tourné (comptes livreurs antérieurs
 * à cette fonctionnalité) — affiché comme un état transitoire plutôt qu'une
 * erreur, puisqu'aucune action utilisateur ne peut le déclencher lui-même.
 */
export function ReferralCodeCard({ code }: { code: string | null }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  if (!code) {
    return (
      <div className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-muted">
        Votre code de parrainage n&apos;est pas encore disponible. Contactez le support si cela persiste.
      </div>
    );
  }

  const link = typeof window !== 'undefined' ? `${window.location.origin}/register/driver?ref=${code}` : '';

  async function copy(value: string, which: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Presse-papiers indisponible (permission refusée, contexte non sécurisé) —
      // le code reste affichable et copiable manuellement, rien de bloquant.
    }
  }

  return (
    <div className="rounded-lg border-2 border-brand-500 bg-brand-50 p-4 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-brand-700">Votre code de parrainage</div>
      <div className="mt-1 text-3xl font-semibold tracking-widest text-brand-700">{code}</div>
      <div className="mt-3 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => copy(code, 'code')}
          className="rounded-md border border-brand-500 bg-white px-3 py-1.5 text-xs font-medium text-brand-700"
        >
          {copied === 'code' ? 'Copié ✓' : 'Copier le code'}
        </button>
        <button
          type="button"
          onClick={() => copy(link, 'link')}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white"
        >
          {copied === 'link' ? 'Copié ✓' : "Copier le lien d'inscription"}
        </button>
      </div>
    </div>
  );
}
