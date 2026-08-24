'use client';

import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CARTO_RASTER_STYLE } from '@/lib/map-style';

interface CustomerTrackingMapProps {
  lat: number;
  lng: number;
}

/**
 * Position du livreur uniquement — jamais la destination : voir la mise en
 * garde dans tracking.service.ts sur les numéros de commande devinables.
 * Un seul marqueur suffit à donner un sens concret à "votre livreur est en
 * route" sans avoir besoin d'exposer l'adresse du client sur cette même vue.
 */
export function CustomerTrackingMap({ lat, lng }: CustomerTrackingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: CARTO_RASTER_STYLE,
      center: [lng, lat],
      zoom: 14,
      attributionControl: false,
    });
    mapRef.current = map;

    // Même bug de dimensionnement que la carte du Control Tower (voir
    // DriverMap.tsx) : la taille du conteneur n'est pas toujours stable au
    // moment de la construction de la carte. Ici le conteneur est en plus
    // niché dans un bloc conditionnel — le marqueur est donc posé seulement
    // après 'load' et un resize() forcé, plutôt qu'immédiatement à la
    // construction (constaté : sans ce report, le canvas restait entièrement
    // transparent malgré des tuiles correctement téléchargées).
    map.once('load', () => {
      map.resize();
      const el = document.createElement('div');
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.borderRadius = '50%';
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)';
      el.style.backgroundColor = '#2563eb';
      markerRef.current = new Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Déplace le marqueur (et recentre) sur chaque nouvelle position reçue,
  // sans reconstruire toute la carte.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !markerRef.current) return;
    markerRef.current.setLngLat([lng, lat]);
    map.easeTo({ center: [lng, lat], duration: 800 });
  }, [lat, lng]);

  return <div ref={containerRef} className="h-48 w-full rounded-lg border border-hairline" />;
}
