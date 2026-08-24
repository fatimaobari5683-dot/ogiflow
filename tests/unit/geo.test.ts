import { describe, it, expect } from 'vitest';
import { haversineDistanceKm, sequenceByNearestNeighbor } from '@/shared/utils/geo';

describe('haversineDistanceKm', () => {
  it('retourne 0 pour deux points identiques', () => {
    expect(haversineDistanceKm({ lat: 33.5731, lng: -7.5898 }, { lat: 33.5731, lng: -7.5898 })).toBe(0);
  });

  it('calcule une distance cohérente entre Casablanca et Rabat (~85-90km à vol d\'oiseau)', () => {
    const casablanca = { lat: 33.5731, lng: -7.5898 };
    const rabat = { lat: 34.0209, lng: -6.8417 };
    const distance = haversineDistanceKm(casablanca, rabat);
    expect(distance).toBeGreaterThan(80);
    expect(distance).toBeLessThan(100);
  });
});

describe('sequenceByNearestNeighbor', () => {
  const start = { lat: 0, lng: 0 };

  it('ordonne les arrêts du plus proche au plus lointain, glouton à chaque étape', () => {
    // Alignés sur l'axe des longitudes à 1°, 2°, 3° du départ — le plus
    // proche voisin successif doit les reprendre dans cet ordre.
    const stops = [
      { id: 'far', lat: 0, lng: 3 },
      { id: 'near', lat: 0, lng: 1 },
      { id: 'mid', lat: 0, lng: 2 },
    ];

    const ordered = sequenceByNearestNeighbor(start, stops, (s) => ({ lat: s.lat, lng: s.lng }));
    expect(ordered.map((s) => s.id)).toEqual(['near', 'mid', 'far']);
  });

  it('laisse les points sans coordonnées à la fin, dans leur ordre d\'origine', () => {
    const stops = [
      { id: 'no-coords-1', point: null },
      { id: 'has-coords', point: { lat: 0, lng: 1 } },
      { id: 'no-coords-2', point: null },
    ];

    const ordered = sequenceByNearestNeighbor(start, stops, (s) => s.point);
    expect(ordered.map((s) => s.id)).toEqual(['has-coords', 'no-coords-1', 'no-coords-2']);
  });

  it('sans position de départ, laisse les points géolocalisés dans leur ordre d\'origine', () => {
    const stops = [
      { id: 'a', lat: 0, lng: 5 },
      { id: 'b', lat: 0, lng: 1 },
    ];

    const ordered = sequenceByNearestNeighbor(null, stops, (s) => ({ lat: s.lat, lng: s.lng }));
    expect(ordered.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('gère une liste vide sans erreur', () => {
    expect(sequenceByNearestNeighbor(start, [], () => null)).toEqual([]);
  });
});
