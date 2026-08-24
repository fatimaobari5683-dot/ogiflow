'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

export function ProductForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/api/v1/products', {
        method: 'POST',
        body: JSON.stringify({
          name,
          sku: sku || undefined,
          price: Number(price),
          weightKg: weightKg ? Number(weightKg) : undefined,
        }),
      });
      setName('');
      setSku('');
      setPrice('');
      setWeightKg('');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>+ Ajouter un produit</Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-secondary">Nom du produit</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm"
            placeholder="Lampe artisanale en laiton"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-secondary">SKU (optionnel)</label>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm"
            placeholder="ATL-001"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-secondary">Prix (MAD)</label>
          <input
            required
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-secondary">Poids (kg, optionnel)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-sm text-status-critical">{error}</p>}

      <div className="flex gap-2">
        <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
          Annuler
        </Button>
        <Button type="submit" loading={loading}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
