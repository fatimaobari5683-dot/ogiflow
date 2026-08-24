'use client';

import { useEffect, useRef } from 'react';

const PING_INTERVAL_MS = 60_000;

/**
 * Le mécanisme manquant identifié en creusant les recommandations soumises
 * sur le "heartbeat" : la route PATCH /api/v1/drivers/[id]/location existait
 * déjà et `lastLocationUpdate` aussi, mais rien côté app livreur ne
 * l'appelait jamais — un livreur restait donc figé sur sa position
 * d'inscription pour toujours. Émet un ping tant que le livreur est en
 * ligne (AVAILABLE ou BUSY), jamais quand OFFLINE — ne rend rien
 * visuellement, c'est un pur effet de bord.
 */
export function DriverLocationPing({ driverId, isOnline }: { driverId: string; isOnline: boolean }) {
  const permissionDeniedRef = useRef(false);

  useEffect(() => {
    if (!isOnline || typeof navigator === 'undefined' || !navigator.geolocation) return;

    function ping() {
      if (permissionDeniedRef.current) return;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetch(`/api/v1/drivers/${driverId}/location`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
          }).catch(() => {});
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) permissionDeniedRef.current = true;
        },
        { enableHighAccuracy: false, maximumAge: 30_000, timeout: 10_000 }
      );
    }

    ping();
    const interval = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [driverId, isOnline]);

  return null;
}
