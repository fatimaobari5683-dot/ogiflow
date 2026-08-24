'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';

export function ToggleProductActive({ productId, isActive }: { productId: string; isActive: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      await apiFetch(`/api/v1/products/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !isActive }),
      });
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
        isActive ? 'bg-[#0ca30c]/10 text-[#006300]' : 'bg-slate-100 text-ink-muted'
      }`}
    >
      {isActive ? 'Actif' : 'Inactif'}
    </button>
  );
}
