/**
 * Distance orthodromique (haversine) entre deux points GPS, en kilomètres.
 * Utilisée par le moteur de dispatch pour estimer la proximité livreur/commande
 * sans dépendre d'un service de cartographie externe (voir dispatch.service.ts).
 */
export function haversineDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const EARTH_RADIUS_KM = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
