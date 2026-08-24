'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function TrackLookupPage() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = orderNumber.trim();
    if (trimmed) {
      router.push(`/track/${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-brand-700">LogiFlow</h1>
          <p className="mt-1 text-sm text-ink-secondary">Suivez votre commande</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-hairline bg-surface p-6">
          <div>
            <label htmlFor="orderNumber" className="block text-sm font-medium text-ink-primary">
              Numéro de commande
            </label>
            <input
              id="orderNumber"
              type="text"
              required
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="ORD-2026-000184"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Suivre ma commande
          </button>
        </form>
      </div>
    </main>
  );
}
