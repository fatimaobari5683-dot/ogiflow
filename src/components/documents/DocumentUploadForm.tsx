'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/lib/api-client';
import { DOCUMENT_TYPE_LABELS } from '@/components/documents/document-labels';

export function DocumentUploadForm({
  ownerType,
  ownerId,
  requiredTypes,
}: {
  ownerType: 'DRIVER' | 'SUPPLIER';
  ownerId: string;
  requiredTypes: string[];
}) {
  const router = useRouter();
  const [type, setType] = useState(requiredTypes[0] ?? '');
  const [documentNumber, setDocumentNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un <input type="file"> ne peut pas être vidé en assignant sa `value` —
  // remonter l'élément via une `key` changeante est la seule façon fiable
  // d'effacer le nom de fichier affiché après un envoi réussi.
  const [fileInputKey, setFileInputKey] = useState(0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Sélectionnez un fichier.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('ownerType', ownerType);
      formData.append('ownerId', ownerId);
      formData.append('type', type);
      if (documentNumber) formData.append('documentNumber', documentNumber);
      if (expiresAt) formData.append('expiresAt', expiresAt);
      formData.append('file', file);

      const res = await fetch('/api/v1/documents', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        throw new ApiError(body?.error ?? `Erreur HTTP ${res.status}`, res.status);
      }

      setFile(null);
      setFileInputKey((k) => k + 1);
      setDocumentNumber('');
      setExpiresAt('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'envoi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <h3 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Ajouter un document</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-secondary">Type de document</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {requiredTypes.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-secondary">N° du document (optionnel)</label>
          <input
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-secondary">Date d&apos;expiration (si applicable)</label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-secondary">Fichier (JPEG, PNG ou PDF, 8 Mo max)</label>
          <input
            key={fileInputKey}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm text-ink-secondary"
          />
        </div>
      </div>

      {error && <p className="text-sm text-status-critical">{error}</p>}

      <Button type="submit" loading={loading}>
        Envoyer
      </Button>
    </form>
  );
}

