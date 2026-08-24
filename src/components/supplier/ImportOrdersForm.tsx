'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

interface RowResult {
  line: number;
  success: boolean;
  orderNumber?: string;
  orderId?: string;
  error?: string;
}

interface ImportSummary {
  successCount: number;
  failureCount: number;
  results: RowResult[];
}

export function ImportOrdersForm({ template }: { template: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function downloadTemplate() {
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modele-import-commandes.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Sélectionnez un fichier CSV.');
      return;
    }
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiFetch<ImportSummary>('/api/v1/orders/import', { method: 'POST', body: formData });
      setSummary(result);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'import.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-hairline bg-surface p-4">
        <button type="button" onClick={downloadTemplate} className="text-sm font-medium text-brand-600 hover:underline">
          Télécharger un modèle CSV
        </button>
        <p className="mt-1 text-xs text-ink-muted">
          Colonnes : customerName, customerPhone, customerEmail, address, city, productSku, quantity, deliveryFee,
          promoCode, instructions. Seules customerEmail, promoCode et instructions sont optionnelles.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
        {error && (
          <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} disabled={!file}>
          Importer
        </Button>
      </form>

      {summary && (
        <div className="rounded-lg border border-hairline bg-surface p-4">
          <div className="mb-3 text-sm font-medium text-ink-primary">
            {summary.successCount} commande{summary.successCount !== 1 ? 's' : ''} créée
            {summary.successCount !== 1 ? 's' : ''}
            {summary.failureCount > 0 && (
              <span className="text-status-critical">
                {' '}
                · {summary.failureCount} échec{summary.failureCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
            {summary.results.map((r) => (
              <li key={r.line} className="flex items-start justify-between gap-3 border-b border-hairline pb-1.5 last:border-0">
                <span className="shrink-0 text-xs text-ink-muted">Ligne {r.line}</span>
                {r.success ? (
                  <Link href={`/supplier/orders/${r.orderId}`} className="text-status-good hover:underline">
                    ✓ {r.orderNumber}
                  </Link>
                ) : (
                  <span className="text-right text-status-critical">✗ {r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
