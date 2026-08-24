'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

interface Product {
  id: string;
  name: string;
  price: number;
}

interface LineItem {
  productId: string;
  quantity: number;
}

export function CreateOrderForm({
  supplierId,
  products,
  commissionRate,
}: {
  supplierId: string;
  products: Product[];
  commissionRate: number;
}) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [city, setCity] = useState('Casablanca');
  const [deliveryFee, setDeliveryFee] = useState('20');
  const [promoCode, setPromoCode] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [scheduledWindowMinutes, setScheduledWindowMinutes] = useState('120');
  const [items, setItems] = useState<LineItem[]>([{ productId: products[0]?.id ?? '', quantity: 1 }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Générée une fois par montage du formulaire et réutilisée à chaque tentative
  // de soumission : un double-clic ou un retry après timeout renvoie la même
  // clé, donc jamais deux commandes créées pour une seule intention d'achat.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const priceById = useMemo(() => new Map(products.map((p) => [p.id, p.price])), [products]);

  const subtotal = items.reduce((sum, item) => sum + (priceById.get(item.productId) ?? 0) * item.quantity, 0);
  const total = subtotal + (Number(deliveryFee) || 0);
  const commission = Math.round(total * (commissionRate / 100) * 100) / 100;
  const netPayout = Math.round((total - commission) * 100) / 100;

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, { productId: products[0]?.id ?? '', quantity: 1 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const order = await apiFetch<{ id: string }>('/api/v1/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          supplierId,
          customer: { fullName: customerName, phone: customerPhone, email: customerEmail || undefined },
          address: { fullAddress, city },
          items: items.filter((item) => item.productId).map((item) => ({ productId: item.productId, quantity: item.quantity })),
          deliveryFee: Number(deliveryFee),
          promoCode: promoCode.trim() || undefined,
          instructions: instructions || undefined,
          scheduledFor: isScheduled && scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
          scheduledWindowMinutes: isScheduled && scheduledFor ? Number(scheduledWindowMinutes) : undefined,
        }),
      });
      router.push(`/supplier/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible.');
      setLoading(false);
    }
  }

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 p-4 text-sm text-ink-secondary">
        Vous devez ajouter au moins un produit à votre catalogue avant de créer une commande.{' '}
        <a href="/supplier/products" className="font-medium text-brand-700 hover:underline">
          Ajouter un produit →
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-4">
      <div className="col-span-2 space-y-4">
        <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Client</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom complet">
              <input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </Field>
            <Field label="Téléphone">
              <input required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+212600000000" className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </Field>
            <Field label="Email (optionnel)">
              <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </Field>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Adresse de livraison</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Adresse complète" full>
              <input required value={fullAddress} onChange={(e) => setFullAddress(e.target.value)} className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </Field>
            <Field label="Ville">
              <input required value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </Field>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Articles</h2>
            <button type="button" onClick={addItem} className="text-sm text-brand-600 hover:underline">
              + Ajouter une ligne
            </button>
          </div>
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                value={item.productId}
                onChange={(e) => updateItem(index, { productId: e.target.value })}
                className="flex-1 rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.price.toLocaleString('fr-FR')} MAD
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => updateItem(index, { quantity: Math.max(1, Number(e.target.value)) })}
                className="w-20 rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(index)} className="px-2 text-status-critical">
                  ✕
                </button>
              )}
            </div>
          ))}
        </section>

        <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Livraison</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frais de livraison (MAD)">
              <input type="number" min={0} step="0.01" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </Field>
            <Field label="Code promo (optionnel)">
              <input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="ex: ETE2026"
                className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-primary">
            <input type="checkbox" checked={isScheduled} onChange={(e) => setIsScheduled(e.target.checked)} />
            Livraison programmée (créneau choisi plutôt qu&apos;au plus vite)
          </label>
          {isScheduled && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Début du créneau">
                <input
                  type="datetime-local"
                  required={isScheduled}
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </Field>
              <Field label="Durée du créneau">
                <select
                  value={scheduledWindowMinutes}
                  onChange={(e) => setScheduledWindowMinutes(e.target.value)}
                  className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="60">1 heure</option>
                  <option value="120">2 heures</option>
                  <option value="240">4 heures</option>
                </select>
              </Field>
              <p className="col-span-2 text-xs text-ink-muted">
                À fixer au moins 2h à l&apos;avance — le dispatch ne devient disponible qu&apos;une heure avant le
                début du créneau.
              </p>
            </div>
          )}
          <Field label="Instructions (optionnel)" full>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} className="w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </Field>
        </section>

        {error && (
          <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading} className="w-full py-3 text-base">
          Créer la commande
        </Button>
      </div>

      <div>
        <div className="sticky top-4 space-y-2 rounded-lg border border-hairline bg-surface p-4 text-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Récapitulatif</h2>
          <div className="flex justify-between text-ink-secondary">
            <span>Sous-total</span>
            <span>{subtotal.toLocaleString('fr-FR')} MAD</span>
          </div>
          <div className="flex justify-between text-ink-secondary">
            <span>Frais de livraison</span>
            <span>{(Number(deliveryFee) || 0).toLocaleString('fr-FR')} MAD</span>
          </div>
          <div className="flex justify-between border-t border-hairline pt-2 font-medium text-ink-primary">
            <span>Total client</span>
            <span>{total.toLocaleString('fr-FR')} MAD</span>
          </div>
          {promoCode && <p className="text-xs text-ink-muted">Réduction du code &laquo;&nbsp;{promoCode}&nbsp;&raquo; appliquée à la validation.</p>}
          <div className="flex justify-between text-ink-muted">
            <span>Commission ({commissionRate}%)</span>
            <span>−{commission.toLocaleString('fr-FR')} MAD</span>
          </div>
          <div className="flex justify-between border-t border-hairline pt-2 font-semibold text-brand-700">
            <span>Votre revenu net</span>
            <span>{netPayout.toLocaleString('fr-FR')} MAD</span>
          </div>
        </div>
      </div>
    </form>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-ink-secondary">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
