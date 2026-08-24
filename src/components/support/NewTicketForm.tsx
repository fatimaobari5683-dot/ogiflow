'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

export function NewTicketForm({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const ticket = await apiFetch<{ id: string }>('/api/v1/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject, description }),
      });
      router.push(`${basePath}/${ticket.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de créer la demande.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full">
        Nouvelle demande
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div>
        <label className="block text-sm font-medium text-ink-primary">Sujet</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Résumez votre problème en quelques mots"
          className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-primary">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Décrivez le problème en détail — mentionnez un numéro de commande si utile."
          rows={4}
          className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      {error && <p className="text-xs text-status-critical">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} loading={busy}>
          Envoyer
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
