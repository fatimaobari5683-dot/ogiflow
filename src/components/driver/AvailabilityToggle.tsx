'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';

type SelfServiceStatus = 'AVAILABLE' | 'OFFLINE';

export function AvailabilityToggle({ driverId, status }: { driverId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = status === 'AVAILABLE';
  const isBusy = status === 'BUSY';

  async function toggle() {
    if (isBusy) return;
    const next: SelfServiceStatus = isAvailable ? 'OFFLINE' : 'AVAILABLE';
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/drivers/${driverId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setLoading(false);
    }
  }

  if (isBusy) {
    return <span className="rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700">En course</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={loading}
        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
          isAvailable ? 'bg-[#0ca30c]/10 text-[#006300]' : 'bg-slate-100 text-ink-secondary'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${isAvailable ? 'bg-[#0ca30c]' : 'bg-ink-muted'}`} />
        {isAvailable ? 'Disponible' : 'Hors ligne'}
      </button>
      {error && <span className="text-xs text-status-critical">{error}</span>}
    </div>
  );
}
