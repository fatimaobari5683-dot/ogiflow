'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, Popup, NavigationControl, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { apiFetch } from '@/lib/api-client';
import { CARTO_RASTER_STYLE } from '@/lib/map-style';

interface DriverLocationPoint {
  id: string;
  driverCode: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  stale: boolean;
  approximate: boolean;
  firstName: string;
  lastName: string;
}

type LocatedDriverPoint = DriverLocationPoint & { latitude: number; longitude: number };

const POLL_INTERVAL_MS = 20_000;

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: '#0ca30c',
  BUSY: '#2563eb',
  OFFLINE: '#94a3b8',
  PENDING_APPROVAL: '#f5a623',
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponible',
  BUSY: 'En course',
  OFFLINE: 'Hors ligne',
  PENDING_APPROVAL: 'En attente d\'approbation',
};

const MOROCCO_CENTER: [number, number] = [-7.09, 31.79];

/**
 * Carte opérationnelle — positions réelles des livreurs, alimentées par
 * DriverLocationPing.tsx côté app livreur.
 */
export function DriverMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const hasCenteredRef = useRef(false);
  const [points, setPoints] = useState<DriverLocationPoint[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocations = useCallback(() => {
    apiFetch<DriverLocationPoint[]>('/api/v1/drivers/locations')
      .then((data) => {
        setPoints(data);
        setError(null);
      })
      .catch(() => setError('Impossible de charger les positions des livreurs.'));
  }, []);

  useEffect(() => {
    fetchLocations();
    const interval = setInterval(fetchLocations, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLocations]);

  // Initialise la carte une seule fois.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: CARTO_RASTER_STYLE,
      center: MOROCCO_CENTER,
      zoom: 5,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.once('load', () => setMapReady(true));
    mapRef.current = map;

    // MapLibre fige la taille du canvas à sa construction. Dans un layout
    // React (flex/grid), la taille réelle du conteneur peut ne se stabiliser
    // qu'après ce premier rendu (hydratation, polices, sidebar) — sans ce
    // ResizeObserver, la carte ne peint que dans une fraction de sa boîte
    // (bug constaté : moitié gauche grise, reste blanc).
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Recentre une seule fois sur les positions connues, dès la première
  // réception de données — ne recentre plus ensuite pour ne pas déplacer la
  // vue sous l'opérateur à chaque rafraîchissement.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const located = points.filter((p): p is LocatedDriverPoint => p.latitude !== null && p.longitude !== null);
    const first = located[0];

    if (!hasCenteredRef.current && first) {
      hasCenteredRef.current = true;
      if (located.length === 1) {
        map.jumpTo({ center: [first.longitude, first.latitude], zoom: 12 });
      } else {
        const bounds = located.reduce(
          (b, p) => b.extend([p.longitude, p.latitude]),
          new LngLatBounds([first.longitude, first.latitude], [first.longitude, first.latitude])
        );
        map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
      }
    }

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = located.map((point) => {
      const color = STATUS_COLORS[point.status] ?? '#94a3b8';
      const el = document.createElement('div');
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '50%';
      el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.35)';
      el.style.cursor = 'pointer';
      if (point.approximate) {
        // Position dérivée de la zone déclarée, pas d'un ping GPS réel — un
        // anneau creux plutôt qu'un disque plein, pour ne jamais laisser
        // croire à une position exacte.
        el.style.border = `3px dashed ${color}`;
        el.style.backgroundColor = 'white';
      } else {
        el.style.border = '2px solid white';
        el.style.backgroundColor = color;
        el.style.opacity = point.stale ? '0.5' : '1';
      }

      const popup = new Popup({ offset: 12, closeButton: false }).setHTML(
        `<div style="font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.5;">
          <strong>${escapeHtml(point.driverCode)}</strong> — ${escapeHtml(point.firstName)} ${escapeHtml(point.lastName)}<br/>
          ${STATUS_LABELS[point.status] ?? point.status}
          ${point.approximate ? '<br/><span style="color:#8a5a00;">◌ position approximative (zone déclarée)</span>' : ''}
          ${!point.approximate && point.stale ? '<br/><span style="color:#b45309;">⚠ position non actualisée</span>' : ''}
        </div>`
      );

      return new Marker({ element: el }).setLngLat([point.longitude, point.latitude]).setPopup(popup).addTo(map);
    });
  }, [points, mapReady]);

  const withoutLocation = points.filter((p) => p.latitude === null || p.longitude === null);

  return (
    <div>
      {error && <p className="mb-2 text-sm text-status-critical">{error}</p>}
      <div ref={containerRef} className="h-96 w-full rounded-lg border border-hairline" />
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
        <LegendDot color={STATUS_COLORS.AVAILABLE!} label="Disponible" />
        <LegendDot color={STATUS_COLORS.BUSY!} label="En course" />
        <LegendDot color={STATUS_COLORS.OFFLINE!} label="Hors ligne" />
        <LegendDot color={STATUS_COLORS.PENDING_APPROVAL!} label="En attente d'approbation" />
        <span className="text-ink-muted">Point atténué = position non actualisée depuis 20+ min</span>
        <span className="text-ink-muted">Anneau pointillé = position approximative (zone déclarée, pas de GPS réel)</span>
        {withoutLocation.length > 0 && (
          <span>
            {withoutLocation.length} livreur{withoutLocation.length > 1 ? 's' : ''} sans position connue
          </span>
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
