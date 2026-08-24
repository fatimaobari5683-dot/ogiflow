'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';

interface ZoneOption {
  id: string;
  name: string;
  city: string;
}

interface DriverZoneAssignmentProps {
  driverId: string;
  assignedZoneIds: string[];
}

/**
 * Zones de service (`DriverZone`) — distinctes de la zone principale
 * déclarée (`baseZone`, affichée en lecture seule au-dessus) : celles-ci
 * pilotent `zoneMatch` dans le scoring de dispatch. Le modèle et l'API
 * existaient déjà (assignDriverToZone / removeDriverFromZone) mais
 * n'étaient jamais reliés à une UI.
 */
export function DriverZoneAssignment({ driverId, assignedZoneIds }: DriverZoneAssignmentProps) {
  const router = useRouter();
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [assigned, setAssigned] = useState(new Set(assignedZoneIds));
  const [pendingZoneId, setPendingZoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ZoneOption[]>('/api/v1/zones')
      .then(setZones)
      .catch(() => setError('Impossible de charger la liste des zones.'));
  }, []);

  useEffect(() => {
    setAssigned(new Set(assignedZoneIds));
  }, [assignedZoneIds]);

  async function toggle(zoneId: string) {
    const isAssigned = assigned.has(zoneId);
    setPendingZoneId(zoneId);
    setError(null);
    try {
      if (isAssigned) {
        await apiFetch(`/api/v1/drivers/${driverId}/zones?zoneId=${zoneId}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/v1/drivers/${driverId}/zones`, {
          method: 'POST',
          body: JSON.stringify({ zoneId }),
        });
      }
      setAssigned((prev) => {
        const next = new Set(prev);
        if (isAssigned) next.delete(zoneId);
        else next.add(zoneId);
        return next;
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setPendingZoneId(null);
    }
  }

  if (zones.length === 0 && !error) return null;

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-status-critical">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {zones.map((zone) => {
          const isAssigned = assigned.has(zone.id);
          const isPending = pendingZoneId === zone.id;
          return (
            <button
              key={zone.id}
              type="button"
              disabled={isPending}
              onClick={() => toggle(zone.id)}
              className={
                'rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ' +
                (isAssigned
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-hairline text-ink-secondary hover:border-brand-300')
              }
              title={isAssigned ? 'Cliquer pour retirer cette zone de service' : 'Cliquer pour assigner cette zone de service'}
            >
              {isAssigned ? '✓ ' : '+ '}
              {zone.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
