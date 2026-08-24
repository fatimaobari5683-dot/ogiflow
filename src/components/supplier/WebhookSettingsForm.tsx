'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';

interface Delivery {
  id: string;
  event: string;
  status: 'SUCCESS' | 'FAILED';
  attempts: number;
  responseStatus: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export function WebhookSettingsForm({
  supplierId,
  initialUrl,
  initialSecret,
  initialDeliveries,
}: {
  supplierId: string;
  initialUrl: string | null;
  initialSecret: string | null;
  initialDeliveries: Delivery[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? '');
  const [secret, setSecret] = useState(initialSecret);
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ webhookUrl: string | null; webhookSecret: string | null }>(
        `/api/v1/suppliers/${supplierId}/webhook`,
        { method: 'PUT', body: JSON.stringify({ url: url.trim() || null }) }
      );
      setSecret(result.webhookSecret);
      setSuccess(result.webhookUrl ? 'Webhook enregistré.' : 'Webhook désactivé.');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de l\'enregistrement.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setUrl('');
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await apiFetch(`/api/v1/suppliers/${supplierId}/webhook`, { method: 'PUT', body: JSON.stringify({ url: null }) });
      setSuccess('Webhook désactivé.');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec de la désactivation.');
    } finally {
      setLoading(false);
    }
  }

  async function retry(deliveryId: string) {
    setRetryingId(deliveryId);
    try {
      const result = await apiFetch<Delivery>(`/api/v1/webhooks/deliveries/${deliveryId}/retry`, { method: 'POST' });
      setDeliveries((prev) => [
        { ...result, createdAt: new Date().toISOString() },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nouvel essai impossible.');
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <div>
          <label className="block text-sm font-medium text-ink-primary">URL du webhook</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://votre-systeme.example.com/webhooks/logiflow"
            className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {secret && (
          <div>
            <label className="block text-sm font-medium text-ink-primary">Secret de signature</label>
            <code className="mt-1 block break-all rounded-md bg-slate-50 px-3 py-2 text-xs">{secret}</code>
            <p className="mt-1 text-xs text-ink-muted">
              Chaque livraison porte un en-tête <code className="font-mono">X-LogiFlow-Signature: sha256=&lt;HMAC&gt;</code>{' '}
              calculé avec ce secret sur le corps brut de la requête — vérifiez-le pour confirmer que l&apos;appel
              vient bien de LogiFlow.
            </p>
          </div>
        )}

        {error && <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>}
        {success && <p className="text-sm text-status-good">{success}</p>}

        <div className="flex gap-2">
          <Button type="submit" loading={loading}>
            Enregistrer
          </Button>
          {initialUrl && (
            <button type="button" onClick={handleDisable} className="rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink-primary">
              Désactiver
            </button>
          )}
        </div>
      </form>

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-muted">Livraisons récentes</h2>
        {deliveries.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucune livraison pour le moment.</p>
        ) : (
          <ul className="space-y-2">
            {deliveries.map((d) => (
              <li key={d.id} className="flex items-center justify-between border-b border-hairline pb-2 text-sm last:border-0 last:pb-0">
                <div>
                  <div className="text-ink-primary">
                    {d.event}{' '}
                    <span className={d.status === 'SUCCESS' ? 'text-status-good' : 'text-status-critical'}>
                      {d.status === 'SUCCESS' ? '✓' : '✗'} {d.responseStatus ?? d.errorMessage ?? ''}
                    </span>
                  </div>
                  <div className="text-xs text-ink-muted">
                    {new Date(d.createdAt).toLocaleString('fr-FR')} · {d.attempts} tentative{d.attempts > 1 ? 's' : ''}
                  </div>
                </div>
                {d.status === 'FAILED' && (
                  <button
                    type="button"
                    onClick={() => retry(d.id)}
                    disabled={retryingId === d.id}
                    className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                  >
                    {retryingId === d.id ? 'Envoi…' : 'Réessayer'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
