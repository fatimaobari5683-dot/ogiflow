'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

interface Supplier {
  id: string;
  companyName: string;
}

export function GenerateSettlementForm({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [periodStart, setPeriodStart] = useState(() => firstOfMonth());
  const [periodEnd, setPeriodEnd] = useState(() => today());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/api/v1/settlements', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(`${periodEnd}T23:59:59.000Z`).toISOString(),
        }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Génération impossible.');
    } finally {
      setLoading(false);
    }
  }

  if (suppliers.length === 0) {
    return <p className="text-sm text-ink-muted">Aucun fournisseur actif.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-ink-secondary">Fournisseur</label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="mt-1 rounded-md border border-hairline px-2 py-1.5 text-sm"
        >
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.companyName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-secondary">Début de période</label>
        <input
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="mt-1 rounded-md border border-hairline px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-secondary">Fin de période</label>
        <input
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          className="mt-1 rounded-md border border-hairline px-2 py-1.5 text-sm"
        />
      </div>
      <Button type="submit" loading={loading}>
        Générer le versement
      </Button>
      {error && <p className="w-full text-sm text-status-critical">{error}</p>}
    </form>
  );
}

function firstOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
