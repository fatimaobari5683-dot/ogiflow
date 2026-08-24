'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

export function PromoCodeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [minOrderAmount, setMinOrderAmount] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/v1/promotions', {
        method: 'POST',
        body: JSON.stringify({
          code,
          discountType,
          discountValue: Number(discountValue),
          maxDiscount: maxDiscount ? Number(maxDiscount) : undefined,
          minOrderAmount: minOrderAmount ? Number(minOrderAmount) : undefined,
          usageLimit: usageLimit ? Number(usageLimit) : undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      setOpen(false);
      setCode('');
      setDiscountValue('');
      setMaxDiscount('');
      setMinOrderAmount('');
      setUsageLimit('');
      setExpiresAt('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de créer le code.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>Nouveau code promo</Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ETE2026" className={inputClass} />
        </Field>
        <Field label="Type de réduction">
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as typeof discountType)} className={inputClass}>
            <option value="PERCENTAGE">Pourcentage</option>
            <option value="FIXED_AMOUNT">Montant fixe (MAD)</option>
          </select>
        </Field>
        <Field label={discountType === 'PERCENTAGE' ? 'Valeur (%)' : 'Valeur (MAD)'}>
          <input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={inputClass} />
        </Field>
        {discountType === 'PERCENTAGE' && (
          <Field label="Plafond (MAD, optionnel)">
            <input type="number" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} className={inputClass} />
          </Field>
        )}
        <Field label="Commande minimum (MAD, optionnel)">
          <input type="number" value={minOrderAmount} onChange={(e) => setMinOrderAmount(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Limite d'utilisation (optionnel)">
          <input type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Expire le (optionnel)">
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
        </Field>
      </div>
      {error && <p className="text-xs text-status-critical">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} loading={busy} disabled={!code || !discountValue}>
          Créer
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

const inputClass =
  'mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-ink-primary">
      {label}
      {children}
    </label>
  );
}
